"""Regression tests for the module-listing IDOR fix.

`GET /api/v1/courses/{course_id}/modules` previously had no auth/ownership
check: any caller could list module metadata for any course. Now it routes
through CourseService.get_course_with_modules, which enforces visibility:
- anonymous/non-owner on a PRIVATE course -> 404 (hidden)
- author on a PRIVATE course -> 200
- anyone on a PUBLIC course -> 200
"""

import pytest


@pytest.mark.asyncio
async def test_list_modules_private_course_requires_auth(client, auth_headers):
    """Non-authenticated caller gets 401 for a private course's modules."""
    # Create a course as owner
    create_resp = await client.post(
        "/api/v1/courses",
        json={"title": "Private Course", "visibility": "private"},
        headers=auth_headers,
    )
    assert create_resp.status_code == 200, create_resp.text
    course_id = create_resp.json()["id"]

    # Anonymous GET should fail (401/403/404 — not a bare 200)
    anon_resp = await client.get(f"/api/v1/courses/{course_id}/modules")
    assert anon_resp.status_code in (401, 403, 404), anon_resp.text


@pytest.mark.asyncio
async def test_list_modules_private_course_owner_ok(client, auth_headers):
    """The author can list their private course's modules."""
    create_resp = await client.post(
        "/api/v1/courses",
        json={"title": "Private Course", "visibility": "private"},
        headers=auth_headers,
    )
    course_id = create_resp.json()["id"]

    resp = await client.get(f"/api/v1/courses/{course_id}/modules", headers=auth_headers)
    assert resp.status_code == 200
    assert resp.json() == []  # no modules yet


@pytest.mark.asyncio
async def test_list_modules_public_course_requires_sign_in(client, auth_headers):
    """A public course's modules are listable by anyone."""
    create_resp = await client.post(
        "/api/v1/courses",
        json={"title": "Public Course", "visibility": "public"},
        headers=auth_headers,
    )
    course_id = create_resp.json()["id"]
    # Add a module so the list is non-trivial
    mod_resp = await client.post(
        f"/api/v1/courses/{course_id}/modules",
        json={"title": "Mod 1", "content_markdown": "hi", "order_index": 0},
        headers=auth_headers,
    )
    assert mod_resp.status_code == 200, mod_resp.text

    anon_resp = await client.get(f"/api/v1/courses/{course_id}/modules")
    assert anon_resp.status_code == 401
    signed_in = await client.get(f"/api/v1/courses/{course_id}/modules", headers=auth_headers)
    assert signed_in.status_code == 200
    assert signed_in.json()[0]["title"] == "Mod 1"


@pytest.mark.asyncio
async def test_list_modules_private_course_other_user_404(client, auth_headers, other_user_headers):
    """A non-owner authenticated user cannot list a private course's modules."""
    create_resp = await client.post(
        "/api/v1/courses",
        json={"title": "Private Course", "visibility": "private"},
        headers=auth_headers,
    )
    course_id = create_resp.json()["id"]

    resp = await client.get(f"/api/v1/courses/{course_id}/modules", headers=other_user_headers)
    assert resp.status_code in (403, 404), resp.text
