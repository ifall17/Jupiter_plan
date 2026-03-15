export enum UserRole {
  SUPER_ADMIN = 'SUPER_ADMIN',
  FPA = 'FPA',
  CONTRIBUTEUR = 'CONTRIBUTEUR',
  LECTEUR = 'LECTEUR',
}

export enum BudgetStatus {
  DRAFT = 'DRAFT',
  SUBMITTED = 'SUBMITTED',
  APPROVED = 'APPROVED',
  LOCKED = 'LOCKED',
  REJECTED = 'REJECTED',
}

export enum PeriodStatus {
  OPEN = 'OPEN',
  CLOSED = 'CLOSED',
}
