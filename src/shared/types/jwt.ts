export interface ICurrentSession {
  deviceId?: string;
  customerId?: string;
  phone?: string;
  token?: string;
}

declare module "express" {
  interface Request {
    user?: ICurrentSession;
  }
}
