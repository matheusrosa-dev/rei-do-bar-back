export interface ICurrentDeliveryPerson {
  id: string;
}

export interface ICurrentDeliveryPersonSession {
  id: string;
  hashedRefreshToken: string;
}

declare module "express" {
  interface Request {
    deliveryPerson?: ICurrentDeliveryPerson;
    deliveryPersonSession?: ICurrentDeliveryPersonSession;
  }
}
