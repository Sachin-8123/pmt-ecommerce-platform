import { Injectable, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { INestApplication } from '@nestjs/common';

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  async onModuleInit() {
    try {
      await this.$connect();
    } catch (err) {
      // Do not crash the application if the database is not available during local development.
      // Prisma client errors will surface when attempting DB operations.
      // Log and continue so health-check and other non-DB endpoints remain available.
      // eslint-disable-next-line no-console
      console.warn('Prisma connect warning:', err.message || err);
    }
  }

  async onModuleDestroy() {
    await this.$disconnect();
  }

  async enableShutdownHooks(app: INestApplication) {
    (this as any).$on('beforeExit', async () => {
      await app.close();
    });
  }
}
