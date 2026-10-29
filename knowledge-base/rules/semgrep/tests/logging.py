import logging, os
from flask import request

logger = logging.getLogger(__name__)

def view(user):
    # ruleid: seckit.log-c2.python-sensitive-data-logged
    logger.info("payload: %s", request.json)
    # ruleid: seckit.log-c2.python-sensitive-data-logged
    logger.debug(f"headers {request.headers}")
    # ruleid: seckit.log-c2.python-sensitive-data-logged
    logging.info(os.environ)
    # ok: seckit.log-c2.python-sensitive-data-logged
    logger.info("login", extra={"user_id": user.id})
