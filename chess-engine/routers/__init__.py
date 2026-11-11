"""
FastAPI routers; main.py includes them in the original route order.

Route handlers deliberately carry no return annotation: FastAPI would turn it
into a response_model, changing the OpenAPI schema and response serialisation
(ADR 0302). Request bodies stay fully typed via the pydantic models.
"""
