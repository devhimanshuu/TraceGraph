/**
 * PrismaService — NestJS-compatible wrapper around PrismaClient.
 * Uses @prisma/adapter-pg for PostgreSQL connection (Prisma 7.x).
 */
import { Injectable, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { PrismaClient } from '../generated/prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';

@Injectable()
export class PrismaService implements OnModuleInit, OnModuleDestroy {
  client!: PrismaClient;

  async onModuleInit(): Promise<void> {
    const connectionString = process.env.DATABASE_URL;
    if (!connectionString) {
      throw new Error('DATABASE_URL environment variable is required');
    }
    const adapter = new PrismaPg({ connectionString });
    this.client = new PrismaClient({ adapter });
    await this.client.$connect();
  }

  async onModuleDestroy(): Promise<void> {
    await this.client.$disconnect();
  }

  // Delegate model accessors
  get user() { return this.client.user; }
  get organization() { return this.client.organization; }
  get workspace() { return this.client.workspace; }
  get workspaceMembership() { return this.client.workspaceMembership; }
  get workspaceInvitation() { return this.client.workspaceInvitation; }
  get savedReport() { return this.client.savedReport; }
  get auditEvent() { return this.client.auditEvent; }

  // Delegate raw query methods
  get $connect() { return this.client.$connect.bind(this.client); }
  get $disconnect() { return this.client.$disconnect.bind(this.client); }
  get $queryRaw() { return this.client.$queryRaw.bind(this.client); }
  get $executeRaw() { return this.client.$executeRaw.bind(this.client); }
}
