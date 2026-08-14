import { NestFactory } from '@nestjs/core';
import { AppModule } from '../src/app.module';
import { DatabaseService } from '../src/database/database.service';

async function main() {
  const app = await NestFactory.createApplicationContext(AppModule, { logger: false });
  const db = app.get(DatabaseService);
  const result = await db.executeWrite(
    (tx) => tx.run('MATCH (n) DETACH DELETE n RETURN count(n) AS deleted'),
    { name: 'clear-all' },
  );
  console.log('deleted:', result);
  await app.close();
}
main().catch((e) => { console.error(e.message); process.exit(1); });
