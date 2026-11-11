class AppError(Exception):
    """An expected API error that can be returned without exposing internals."""

    def __init__(self, status_code: int, message: str):
        super().__init__(message)
        self.status_code = status_code
        self.message = message
