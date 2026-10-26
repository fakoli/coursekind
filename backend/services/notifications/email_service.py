from pathlib import Path

import httpx

from config import Settings


class EmailService:
    def __init__(self, settings: Settings):
        self.settings = settings
        self.templates_path = Path(__file__).parent / "templates"

    @property
    def is_configured(self) -> bool:
        return bool(self.settings.mailgun_api_key and self.settings.mailgun_domain)

    def _load_template(self, template_name: str, context: dict) -> str:
        """Load and render an email template."""
        template_path = self.templates_path / f"{template_name}.html"

        if template_path.exists():
            with open(template_path) as f:
                template = f.read()

            for key, value in context.items():
                template = template.replace(f"{{{{ {key} }}}}", str(value))

            return template

        return self._default_template(template_name, context)

    def _default_template(self, template_name: str, context: dict) -> str:
        """Generate a default template if file doesn't exist."""
        content = context.get("content", "")
        user_name = context.get("user_name", "Learner")

        return f"""
        <!DOCTYPE html>
        <html>
        <head>
            <style>
                body {{ font-family: Arial, sans-serif; line-height: 1.6; color: #333; }}
                .container {{ max-width: 600px; margin: 0 auto; padding: 20px; }}
                .header {{ background-color: #4F46E5; color: white;
                    padding: 20px; text-align: center; }}
                .content {{ padding: 20px; background-color: #f9f9f9; }}
                .footer {{ padding: 20px; text-align: center; font-size: 12px; color: #666; }}
            </style>
        </head>
        <body>
            <div class="container">
                <div class="header">
                    <h1>Coursekind</h1>
                </div>
                <div class="content">
                    <p>Hi {user_name},</p>
                    <p>{content}</p>
                </div>
                <div class="footer">
                    <p>Happy learning!</p>
                    <p>The Coursekind Team</p>
                </div>
            </div>
        </body>
        </html>
        """

    async def send(
        self,
        to: str,
        subject: str,
        template: str,
        context: dict,
    ) -> bool:
        """Send an email using Mailgun."""
        if not self.is_configured:
            return False

        html_content = self._load_template(template, context)

        try:
            async with httpx.AsyncClient() as client:
                response = await client.post(
                    f"https://api.mailgun.net/v3/{self.settings.mailgun_domain}/messages",
                    auth=("api", self.settings.mailgun_api_key),
                    data={
                        "from": f"Coursekind <noreply@{self.settings.mailgun_domain}>",
                        "to": to,
                        "subject": subject,
                        "html": html_content,
                    },
                )

                return response.status_code == 200

        except Exception as e:
            print(f"[Email Error] {e}")
            return False
