import { Global, Module } from '@nestjs/common';
import { DatabaseService } from './database.service';

/**
 * Global database module: the single entry point to CognoDB for every domain
 * module. Marked @Global so future graph repositories can inject
 * DatabaseService without importing the module everywhere.
 */
@Global()
@Module({
  providers: [DatabaseService],
  exports: [DatabaseService],
})
export class DatabaseModule {}
