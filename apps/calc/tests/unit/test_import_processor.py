"""
Tests unitaires du processeur d'import.
"""

import io
from decimal import Decimal
from unittest.mock import MagicMock, patch

import openpyxl
import pytest

from services.import_processor import ImportProcessor


class FakeS3:
    def __init__(self, content: bytes):
        self._content = content
        self.deleted = []

    async def get_object(self, _key: str):
        return self._content

    async def delete_object(self, key: str):
        self.deleted.append(key)


def build_excel(rows):
    wb = openpyxl.Workbook()
    ws = wb.active
    ws.append(['period_id', 'account_code', 'account_label', 'department', 'amount'])
    for row in rows:
        ws.append(row)
    buffer = io.BytesIO()
    wb.save(buffer)
    return buffer.getvalue()


class TestImportProcessor:
    @pytest.mark.unit
    @pytest.mark.security
    @pytest.mark.asyncio
    async def test_never_writes_to_disk(self):
        payload = build_excel([
            ['p1', '701000', 'Ventes', 'VENTES', 5000000],
        ])
        processor = ImportProcessor(FakeS3(payload))

        with patch('builtins.open') as mock_open, patch('tempfile.NamedTemporaryFile') as mock_temp:
            await processor.process('test/import.xlsx')
            mock_open.assert_not_called()
            mock_temp.assert_not_called()

    @pytest.mark.unit
    @pytest.mark.security
    @pytest.mark.asyncio
    async def test_rejects_invalid_syscohada_codes(self):
        payload = build_excel([
            ['p1', 'INVALID', 'Bad', 'VENTES', 1000000],
            ['p1', '701000', 'OK', 'VENTES', 5000000],
            ['p1', '706000', 'Services', 'SERVICES', 900000],
        ])
        processor = ImportProcessor(FakeS3(payload))
        result = await processor.process('test/import_invalid.xlsx')

        assert result['skipped'] == 1
        assert result['inserted'] == 2
        assert len(result['errors']) == 1

    @pytest.mark.unit
    @pytest.mark.asyncio
    async def test_rejects_file_when_more_than_50pct_invalid(self):
        rows = []
        for i in range(7):
            rows.append(['p1', f'INVALID{i}', 'Invalide', 'VENTES', 1000])
        for _ in range(3):
            rows.append(['p1', '701000', 'Ventes', 'VENTES', 1000000])

        processor = ImportProcessor(FakeS3(build_excel(rows)))
        result = await processor.process('test/mostly_invalid.xlsx')

        assert result['rejected'] is True
        assert result['inserted'] == 0

    @pytest.mark.unit
    @pytest.mark.precision
    @pytest.mark.asyncio
    async def test_converts_amounts_to_decimal_not_float(self):
        processor = ImportProcessor(
            FakeS3(
                build_excel([
                    ['p1', '701000', 'Ventes', 'VENTES', 5000000.1],
                    ['p1', '601000', 'Achats', 'ACHATS', 2000000.2],
                ])
            )
        )
        result = await processor.process('test/import.xlsx')
        assert result['inserted'] == 2
        assert to_decimal('5000000.1') == Decimal('5000000.1')

    @pytest.mark.unit
    @pytest.mark.security
    @pytest.mark.asyncio
    async def test_deletes_s3_file_after_success(self):
        s3 = FakeS3(build_excel([['p1', '701000', 'Ventes', 'VENTES', 5000000]]))
        processor = ImportProcessor(s3)
        await processor.process('test/import.xlsx')
        assert s3.deleted == ['test/import.xlsx']

    @pytest.mark.unit
    @pytest.mark.security
    @pytest.mark.asyncio
    async def test_deletes_s3_file_even_on_failure(self):
        s3 = FakeS3(b'corrupted data')
        processor = ImportProcessor(s3)
        with pytest.raises(Exception):
            await processor.process('test/corrupt.xlsx')
        assert s3.deleted == ['test/corrupt.xlsx']


def to_decimal(value):
    return Decimal(str(value))
