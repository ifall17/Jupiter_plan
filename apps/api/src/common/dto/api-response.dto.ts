export class ApiResponseDto<T> {
  success!: boolean;
  data?: T;
  code?: string;
  message?: string;
  timestamp!: string;
}
