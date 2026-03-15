"""
Tests integration import (S3 mock + PostgreSQL test).
"""

import io

import openpyxl
import pytest

from services.import_processor import ImportProcessor


class AsyncS3Mock:
    def __init__(self, payload: bytes):
        self.payload = payload
        self.deleted = []

    async def get_object(self, _key: str):
        return self.payload

    async def delete_object(self, key: str):
        self.deleted.append(key)


def _excel_payload(rows):
    wb = openpyxl.Workbook()
    ws = wb.active
    ws.append(['period_id', 'account_code', 'account_label', 'department', 'amount'])
    for row in rows:
        ws.append(row)
    buffer = io.BytesIO()
    wb.save(buffer)
    return buffer.getvalue()


@pytest.mark.integration
class TestImportIntegration:
    async def test_imports_valid_excel_and_counts_rows(self, real_db_session, seed_test_data):
        payload = _excel_payload(
            [
                [seed_test_data['period_id'], '701000', 'Ventes', 'VENTES', 5000000],
                [seed_test_data['period_id'], '601000', 'Achats', 'ACHATS', 2000000],
            ]
        )
        s3 = AsyncS3Mock(payload)
        processor = ImportProcessor(s3)

        result = await processor.process('imports/valid.xlsx')

        assert result['inserted'] == 2
        assert result['skipped'] == 0
        assert result['rejected'] is False
        assert s3.deleted == ['imports/valid.xlsx']

    async def test_fails_when_invalid_ratio_too_high(self, real_db_session, seed_test_data):
        payload = _excel_payload(
            [
                [seed_test_data['period_id'], 'INVALID', 'Bad', 'VENTES', 100],
                [seed_test_data['period_id'], 'INVALID2', 'Bad', 'VENTES', 200],
                [seed_test_data['period_id'], '701000', 'Ventes', 'VENTES', 5000],
            ]
        )
        s3 = AsyncS3Mock(payload)
        processor = ImportProcessor(s3)

        result = await processor.process('imports/invalid.xlsx')

        assert result['rejected'] is True
        assert result['inserted'] == 0
        assert s3.deleted == ['imports/invalid.xlsx']
