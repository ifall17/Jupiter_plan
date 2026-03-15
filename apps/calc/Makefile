test-unit:
	pytest tests/unit/ -v --tb=short -m unit

test-integration:
	pytest tests/integration/ -v --tb=short -m integration

test-precision:
	pytest -v --tb=short -m precision

test-security:
	pytest -v --tb=short -m security

test-all:
	pytest -v --tb=short --cov=services --cov=utils \
		--cov-report=term-missing \
		--cov-fail-under=80

test-watch:
	pytest-watch tests/unit/ -- -v --tb=short
