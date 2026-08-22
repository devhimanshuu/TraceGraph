import { Module } from '@nestjs/common';
import { TestIntelligenceController } from './test-intelligence.controller';
import { TestSelectionService } from './test-selection.service';
import { DatabaseModule } from '../database/database.module';

@Module({
  imports: [DatabaseModule],
  controllers: [TestIntelligenceController],
  providers: [TestSelectionService],
  exports: [TestSelectionService],
})
export class TestIntelligenceModule {}
