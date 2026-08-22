import { Module } from '@nestjs/common';
import { OwnershipController } from './ownership.controller';
import { OwnershipService } from './ownership.service';
import { DatabaseModule } from '../database/database.module';

@Module({
  imports: [DatabaseModule],
  controllers: [OwnershipController],
  providers: [OwnershipService],
  exports: [OwnershipService],
})
export class OwnershipModule {}
