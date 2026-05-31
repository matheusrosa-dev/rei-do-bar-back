import { Module } from "@nestjs/common";
import { MeService } from "./me.service";
import { MeController } from "./me.controller";
import { AddressController } from "./address.controller";

@Module({
  controllers: [MeController, AddressController],
  providers: [MeService],
})
export class MeModule {}
