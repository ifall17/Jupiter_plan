import os
import sys
from decimal import Decimal
from pathlib import Path
from unittest.mock import AsyncMock, MagicMock

import pytest
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

CALC_ROOT = Path(__file__).resolve().parent
if str(CALC_ROOT) not in sys.path:
    sys.path.insert(0, str(CALC_ROOT))

ENV_TEST_PATH = CALC_ROOT / '.env.test'
if ENV_TEST_PATH.exists():
    for line in ENV_TEST_PATH.read_text(encoding='utf-8').splitlines():
        entry = line.strip()
        if not entry or entry.startswith('#') or '=' not in entry:
            continue
        key, value = entry.split('=', 1)
        os.environ.setdefault(key.strip(), value.strip())


@pytest.fixture(scope='session', autouse=True)
def verify_test_environment():
    db_url = os.getenv('DATABASE_URL', '')
    if 'test' not in db_url and os.getenv('NODE_ENV') != 'test':
        pytest.exit(
            'PROTECTION: DATABASE_URL ne pointe pas sur test DB. '
            'Verifier apps/calc/.env.test'
        )


@pytest.fixture
def test_org():
    return {
        'org_id': 'test-org-uuid-0001',
        'currency': 'XOF',
        'fiscal_year': 'FY2026',
    }


@pytest.fixture
def test_period(test_org):
    return {
        'period_id': 'test-period-uuid-0001',
        'org_id': test_org['org_id'],
        'period_number': 1,
        'label': 'Janvier 2026',
    }


@pytest.fixture
def test_transactions():
    return [
        {
            'account_code': '701000',
            'line_type': 'REVENUE',
            'amount': Decimal('50000000'),
            'department': 'VENTES',
        },
        {
            'account_code': '706000',
            'line_type': 'REVENUE',
            'amount': Decimal('5000000'),
            'department': 'SERVICES',
        },
        {
            'account_code': '601000',
            'line_type': 'EXPENSE',
            'amount': Decimal('20000000'),
            'department': 'ACHATS',
        },
        {
            'account_code': '621000',
            'line_type': 'EXPENSE',
            'amount': Decimal('8000000'),
            'department': 'RH',
        },
        {
            'account_code': '625000',
            'line_type': 'EXPENSE',
            'amount': Decimal('2000000'),
            'department': 'LOGISTIQUE',
        },
    ]


@pytest.fixture
def balanced_snapshot():
    return {
        'bs_assets': Decimal('100000000'),
        'bs_liabilities': Decimal('60000000'),
        'bs_equity': Decimal('40000000'),
    }


@pytest.fixture
def mock_db():
    session = AsyncMock()
    session.execute = AsyncMock()
    session.commit = AsyncMock()
    session.rollback = AsyncMock()
    return session


@pytest.fixture
def mock_s3():
    s3 = MagicMock()
    s3.get_object = AsyncMock(return_value=b'')
    s3.delete_object = AsyncMock()
    return s3


@pytest.fixture(scope='session')
def db_engine():
    database_url = os.getenv('DATABASE_URL', '')
    if not database_url:
        pytest.skip('DATABASE_URL absent pour tests integration')

    engine = create_async_engine(database_url, future=True)
    return engine


@pytest.fixture
async def real_db_session(db_engine):
    async_session = async_sessionmaker(bind=db_engine, class_=AsyncSession, expire_on_commit=False)
    async with async_session() as session:
        try:
            await session.execute(text('SELECT 1'))
        except Exception as exc:
            pytest.skip(f'PostgreSQL test indisponible: {exc}')
        yield session


@pytest.fixture
async def seed_test_data(real_db_session):
    org_id = '11111111-1111-1111-1111-111111111111'
    fiscal_year_id = '22222222-2222-2222-2222-222222222222'
    period_id = '33333333-3333-3333-3333-333333333333'
    period2_id = '44444444-4444-4444-4444-444444444444'

    await real_db_session.execute(
        text(
            """
            INSERT INTO organizations (id, name, country, currency, plan, is_active, created_at, updated_at)
            VALUES (:id, 'Org Test Calc', 'SN', 'XOF', 'ENTERPRISE', true, NOW(), NOW())
            ON CONFLICT (id) DO NOTHING
            """
        ),
        {'id': org_id},
    )

    await real_db_session.execute(
        text(
            """
            INSERT INTO fiscal_years (id, org_id, label, start_date, end_date, status, created_at)
            VALUES (:id, :org_id, 'FY2026', NOW(), NOW() + INTERVAL '365 days', 'ACTIVE', NOW())
            ON CONFLICT (id) DO NOTHING
            """
        ),
        {'id': fiscal_year_id, 'org_id': org_id},
    )

    await real_db_session.execute(
        text(
            """
            INSERT INTO periods (id, fiscal_year_id, org_id, label, period_number, start_date, end_date, status)
            VALUES (:id, :fy, :org, 'P1', 1, NOW(), NOW() + INTERVAL '30 days', 'OPEN')
            ON CONFLICT (id) DO NOTHING
            """
        ),
        {'id': period_id, 'fy': fiscal_year_id, 'org': org_id},
    )
    await real_db_session.execute(
        text(
            """
            INSERT INTO periods (id, fiscal_year_id, org_id, label, period_number, start_date, end_date, status)
            VALUES (:id, :fy, :org, 'P2', 2, NOW(), NOW() + INTERVAL '60 days', 'OPEN')
            ON CONFLICT (id) DO NOTHING
            """
        ),
        {'id': period2_id, 'fy': fiscal_year_id, 'org': org_id},
    )

    await real_db_session.execute(
        text(
            """
            INSERT INTO transactions (id, org_id, period_id, account_code, account_label, department, amount, is_validated, created_at)
            VALUES
            ('55555555-5555-5555-5555-555555555555', :org, :period, '701000', 'Ventes', 'VENTES', 5000000, false, NOW()),
            ('66666666-6666-6666-6666-666666666666', :org, :period, '601000', 'Achats', 'ACHATS', 2000000, false, NOW())
            ON CONFLICT (id) DO NOTHING
            """
        ),
        {'org': org_id, 'period': period_id},
    )

    await real_db_session.commit()

    return {
        'org_id': org_id,
        'fiscal_year_id': fiscal_year_id,
        'period_id': period_id,
        'next_period_id': period2_id,
        'unbalanced_period_id': period2_id,
    }
