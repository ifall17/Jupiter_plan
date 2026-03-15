from decimal import Decimal

from services.kpi_calculator import KpiCalculator



def test_should_calculate_ebitda_correctly_with_decimal(caplog):
    # Arrange
    calculator = KpiCalculator()
    values = {
        "ca": Decimal("1500.50"),
        "charges": Decimal("500.25"),
        "cash_balance": Decimal("1000"),
        "monthly_burn_rate": Decimal("250"),
        "receivables": Decimal("300"),
    }

    # Act
    result = calculator.calculate("org-1", "period-1", values)

    # Assert
    assert result["ebitda"] == Decimal("1000.25")



def test_should_return_decimal_zero_when_ca_zero_not_raise_exception():
    # Arrange
    calculator = KpiCalculator()
    values = {
        "ca": Decimal("0"),
        "charges": Decimal("100"),
        "cash_balance": Decimal("1000"),
        "monthly_burn_rate": Decimal("200"),
        "receivables": Decimal("50"),
    }

    # Act
    result = calculator.calculate("org-1", "period-1", values)

    # Assert
    assert result["marge"] == Decimal("0")



def test_should_detect_threshold_breach_and_create_alert():
    # Arrange
    calculator = KpiCalculator()

    # Act
    alerts = calculator.detect_alerts({"marge": Decimal("4")})

    # Assert
    assert len(alerts) == 1
    assert alerts[0]["severity"] == "CRITICAL"



def test_should_log_calculation_duration(caplog):
    # Arrange
    calculator = KpiCalculator()

    # Act
    calculator.calculate(
        "org-1",
        "period-1",
        {
            "ca": Decimal("100"),
            "charges": Decimal("50"),
            "cash_balance": Decimal("0"),
            "monthly_burn_rate": Decimal("1"),
            "receivables": Decimal("0"),
        },
    )

    # Assert
    assert "KPI calc done" in caplog.text
