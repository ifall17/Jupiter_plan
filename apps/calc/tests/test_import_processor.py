import io
from typing import Optional

import pandas as pd
import pytest

from services.import_processor import ImportProcessor
from utils.decimal_utils import to_decimal
from utils.syscohada import is_valid_syscohada


class FakeS3:
    def __init__(self, content: Optional[bytes]) -> None:
        self.content = content
        self.deleted_keys: list[str] = []

    async def get_object(self, _key: str):
        return self.content

    async def delete_object(self, key: str):
        self.deleted_keys.append(key)



def _to_excel_bytes(frame: pd.DataFrame) -> bytes:
    buffer = io.BytesIO()
    frame.to_excel(buffer, index=False)
    return buffer.getvalue()


@pytest.mark.asyncio
async def test_should_reject_file_when_more_than_50pct_rows_invalid():
    # Arrange
    frame = pd.DataFrame(
        [
            {"period_id": "p1", "account_code": "123", "account_label": "A", "department": "", "amount": -10},
            {"period_id": "p1", "account_code": "999", "account_label": "B", "department": "", "amount": -20},
            {"period_id": "p1", "account_code": "701000", "account_label": "C", "department": "VENTES", "amount": 100},
        ]
    )
    s3 = FakeS3(_to_excel_bytes(frame))
    processor = ImportProcessor(s3)

    # Act
    result = await processor.process("imports/test.xlsx")

    # Assert
    assert result["rejected"] is True



def test_should_convert_float_amounts_to_decimal_via_string():
    # Arrange
    value = 0.1

    # Act
    decimal_value = to_decimal(value)

    # Assert
    assert str(decimal_value) == "0.1"



def test_should_validate_syscohada_codes_correctly():
    # Arrange / Act / Assert
    assert is_valid_syscohada("701000") is True
    assert is_valid_syscohada("123") is False


@pytest.mark.asyncio
async def test_should_delete_s3_file_after_processing():
    # Arrange
    frame = pd.DataFrame(
        [{"period_id": "p1", "account_code": "701000", "account_label": "Sales", "department": "VENTES", "amount": 100}]
    )
    s3 = FakeS3(_to_excel_bytes(frame))
    processor = ImportProcessor(s3)

    # Act
    await processor.process("imports/test.xlsx")

    # Assert
    assert "imports/test.xlsx" in s3.deleted_keys


@pytest.mark.asyncio
async def test_should_never_write_to_local_disk(monkeypatch):
    # Arrange
    import tempfile

    called = {"value": False}

    def _fail(*_args, **_kwargs):
        called["value"] = True
        raise AssertionError("tempfile usage is forbidden")

    monkeypatch.setattr(tempfile, "NamedTemporaryFile", _fail)
    frame = pd.DataFrame(
        [{"period_id": "p1", "account_code": "701000", "account_label": "Sales", "department": "VENTES", "amount": 100}]
    )
    s3 = FakeS3(_to_excel_bytes(frame))
    processor = ImportProcessor(s3)

    # Act
    await processor.process("imports/test.xlsx")

    # Assert
    assert called["value"] is False
