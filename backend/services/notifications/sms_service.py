from config import Settings


class SMSService:
    def __init__(self, settings: Settings):
        self.settings = settings

    @property
    def is_configured(self) -> bool:
        from importlib.util import find_spec

        return bool(
            self.settings.twilio_account_sid
            and self.settings.twilio_auth_token
            and self.settings.twilio_phone_number
            and find_spec("twilio")
        )

    async def send(self, to: str, message: str) -> bool:
        """Send an SMS message."""
        if not self.is_configured:
            return False

        try:
            from twilio.rest import Client

            client = Client(
                self.settings.twilio_account_sid,
                self.settings.twilio_auth_token,
            )

            client.messages.create(
                body=message,
                from_=self.settings.twilio_phone_number,
                to=to,
            )

            return True

        except ImportError:
            print("[SMS Error] Twilio library not installed")
            return False
        except Exception as e:
            print(f"[SMS Error] {e}")
            return False

    async def handle_reply(self, from_number: str, body: str) -> str:
        """Handle an incoming SMS reply."""
        body_lower = body.strip().lower()

        if body_lower in ["a", "b", "c", "d"]:
            return f"Thanks for your answer: {body_lower.upper()}! Check the app for results."

        if body_lower in ["stop", "unsubscribe"]:
            return "You've been unsubscribed from Coursekind SMS notifications."

        if body_lower in ["help", "?"]:
            return "Reply with A, B, C, or D to answer quiz questions. Reply STOP to unsubscribe."

        return "Reply A, B, C, or D for quizzes, or HELP for assistance."
