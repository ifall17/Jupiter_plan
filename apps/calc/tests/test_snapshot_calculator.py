from decimal import Decimal

import pytest

from services.snapshot_calculator import BalanceMismatchError, SnapshotCalculator



def test_should_raise_balance_mismatch_error_when_balance_unequal():
    # Arrange
    calculator = SnapshotCalculator()
    values = {
        "assets": Decimal("100"),
        "liabilities": Decimal("40"),
        "is_revenue": Decimal("0"),
        "is_expenses": Decimal("0"),
        "amortissements": Decimal("0"),
        "taxes": Decimal("0"),
        "cf_operating": Decimal("0"),
        "cf_investing": Decimal("0"),
        "cf_financing": Decimal("0"),
    }

    # Act / Assert
    with pytest.raises(BalanceMismatchError):
        calculator.calculate("org-1", "period-1", values)



def test_should_set_scenario_id_none_for_real_data_snapshots():
    # Arrange
    calculator = SnapshotCalculator()
    values = {
        "assets": Decimal("100"),
        "liabilities": Decimal("60"),
        "is_revenue": Decimal("120"),
        "is_expenses": Decimal("80"),
        "amortissements": Decimal("5"),
        "taxes": Decimal("5"),
        "cf_operating": Decimal("1"),
        "cf_investing": Decimal("1"),
        "cf_financing": Decimal("1"),
    }

    # Act
    snapshot = calculator.calculate("org-1", "period-1", values, scenario_id=None)

    # Assert
    assert snapshot["scenario_id"] is None



def test_should_use_upsert_identity_not_insert_duplicates():
    # Arrange

    # Act
    identity = SnapshotCalculator.build_upsert_identity("org-1", "period-1", None)

    # Assert
    assert identity == {"org_id": "org-1", "period_id": "period-1", "scenario_id": None}
