"""Regression contracts for the consolidated whole-branch review."""

import base64
from unittest.mock import Mock

import pytest

from config import Settings
from exceptions import AIServiceException, StudyBuddyException
from models.course import CourseCreate
from models.module import ModuleCreate, ModuleUpdate
from services.access_service import AccessService, can_discover, can_read
from services.ai_preferences_service import AIPreferencesService
from services.course_service import CourseService
from services.image_service import ImageService
from services.module_service import ModuleService

PNG = base64.b64decode(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII="
)


async def test_retired_selection_is_visible_but_never_falls_back(storage):
    await storage.create(
        "ai_preferences",
        {"id": "owner", "provider": "codex_subscription", "model": "old-model", "credentials": {}},
    )
    service = AIPreferencesService(storage, Settings(_env_file=None, debug=True))
    result = await service.get("owner")
    assert result["provider"] == "codex_subscription"
    assert result["unavailable_reason"]
    assert not result["is_configured"]
    with pytest.raises(AIServiceException, match="retired"):
        await service.snapshot("owner")


@pytest.mark.parametrize("visibility", ["private", "public", "unlisted"])
def test_every_visibility_requires_sign_in(visibility):
    assert not can_read({"visibility": visibility}, None, "author_id")
    assert not can_discover({"visibility": visibility}, None, "author_id")


async def test_filesystem_course_requires_sign_in(storage, tmp_path):
    directory = tmp_path / "trusted"
    directory.mkdir()
    (directory / "meta.json").write_text('{"title":"Trusted"}')
    service = AccessService(storage, str(tmp_path))
    with pytest.raises(StudyBuddyException):
        await service.require_course("trusted", None)
    assert (await service.require_course("trusted", "reader"))["title"] == "Trusted"


@pytest.mark.parametrize(
    "filename,content",
    [
        ("active.svg", b'<svg onload="alert(1)"/>'),
        ("fake.png", b"<svg><script>marker</script></svg>"),
        ("fake.jpg", b"not an image"),
    ],
)
async def test_upload_rejects_active_or_mislabeled_content(tmp_path, filename, content):
    with pytest.raises(StudyBuddyException):
        await ImageService(str(tmp_path)).upload_image(content, filename, "course")
    assert not list(tmp_path.rglob("*.*"))


@pytest.mark.parametrize(
    "url",
    [
        "http://127.0.0.1/internal",
        "http://169.254.169.254/",
        "http://[::1]/",
        "http://user:pass@example.test/image",
        "https://redirect.test/image",
        "https://oversize.test/image",
        "https://not-image.test/",
    ],
)
async def test_server_image_import_never_contacts_network(tmp_path, monkeypatch, url):
    import aiohttp

    network = Mock(side_effect=AssertionError("Network is forbidden"))
    monkeypatch.setattr(aiohttp.ClientSession, "get", network)
    with pytest.raises(StudyBuddyException, match="disabled"):
        await ImageService(str(tmp_path)).download_external_image(url, "course")
    network.assert_not_called()


async def test_module_objectives_survive_all_projections(storage):
    course = await CourseService(storage).create_course(
        "owner", "Owner", CourseCreate(title="Course")
    )
    modules = ModuleService(storage)
    data = ModuleCreate(title="Lesson", order_index=0, objectives=["Understand safety"])
    module = await modules.create_module(course.id, "owner", data)
    assert (await modules.get_module(course.id, module.id, "owner")).objectives == data.objectives
    assert (
        await modules.update_module(course.id, module.id, "owner", ModuleUpdate(title="Edited"))
    ).objectives == data.objectives
    assert (await modules.batch_create_modules(course.id, "owner", [data]))[
        0
    ].objectives == data.objectives


async def test_membership_counts_are_live_after_warmed_reads(storage):
    courses = CourseService(storage)
    course = await courses.create_course("owner", "Owner", CourseCreate(title="Course"))
    modules = ModuleService(storage)

    async def count():
        return next(
            c for c in await courses.list_user_courses("owner") if c.id == course.id
        ).module_count

    assert await count() == 0
    module = await modules.create_module(course.id, "owner", ModuleCreate(title="A", order_index=0))
    assert await count() == 1
    await modules.batch_create_modules(course.id, "owner", [ModuleCreate(title="B", order_index=1)])
    assert await count() == 2
    await modules.delete_module(course.id, module.id, "owner")
    assert await count() == 1
    # The orchestrator commits directly through storage; count cannot depend on CRUD invalidation.
    async with storage.transaction():
        for item in await storage.list("modules", {"course_id": course.id}):
            await storage.delete("modules", item["id"])
    assert await count() == 0


async def test_legacy_svg_remains_on_disk_but_is_not_served(
    client, auth_headers, course_with_modules, tmp_path, monkeypatch
):
    from PIL import Image

    monkeypatch.chdir(tmp_path)
    cid = course_with_modules["course"]["id"]
    mid = course_with_modules["modules"][0]["id"]
    for directory, endpoint in [("images", "images"), (f"{mid}/visuals", f"{mid}/visuals")]:
        root = tmp_path / "uploads" / "courses" / cid / directory
        root.mkdir(parents=True)
        active = (b'<svg xmlns="http://www.w3.org/2000/svg" onload="marker()">'
                  b'<script>marker</script><image href="http://example.test"/></svg>')
        for name in ["old.svg", "disguised.png"]:
            (root / name).write_bytes(active)
            response = await client.get(
                f"/api/v1/uploads/courses/{cid}/{endpoint}/{name}", headers=auth_headers
            )
            assert response.status_code == 404
            assert (root / name).read_bytes() == active
        Image.new("RGB", (2, 2)).save(root / "safe.png")
        safe = await client.get(
            f"/api/v1/uploads/courses/{cid}/{endpoint}/safe.png", headers=auth_headers
        )
        assert safe.status_code == 200
        assert safe.headers["content-type"] == "image/png"
        assert safe.headers["x-content-type-options"] == "nosniff"


async def test_oversize_upload_and_remote_markdown_preserve_reference(tmp_path):
    from services.image_service import MAX_IMAGE_SIZE

    service = ImageService(str(tmp_path))
    with pytest.raises(StudyBuddyException):
        await service.upload_image(b"x" * (MAX_IMAGE_SIZE + 1), "large.png", "course")
    markdown = "![Remote](https://example.test/image.png)"
    assert await service.process_markdown(markdown, "course") == markdown


async def test_anonymous_http_cannot_read_discovery_detail_nested_or_media(
    client, auth_headers, course_with_modules
):
    cid = course_with_modules["course"]["id"]
    mid = course_with_modules["modules"][0]["id"]
    await client.put(f"/api/v1/courses/{cid}", headers=auth_headers, json={"visibility": "public"})
    for path in [
        "/courses",
        "/courses/discover",
        "/paths",
        f"/courses/{cid}",
        f"/courses/{cid}/modules",
        f"/courses/{cid}/modules/{mid}",
        f"/uploads/courses/{cid}/images/image.png",
    ]:
        assert (await client.get("/api/v1" + path)).status_code == 401
