/**
 * ParserController — API endpoints for the parser platform.
 *
 * GET /api/parser/capabilities — language support matrix
 * GET /api/parser/stats — parse statistics for the active repository
 */
import { Controller, Get, Logger } from '@nestjs/common';
import { ParserRegistry } from './parser-registry';

@Controller('api/parser')
export class ParserController {
  private readonly logger = new Logger(ParserController.name);

  constructor(private readonly registry: ParserRegistry) {}

  /** GET /api/parser/capabilities */
  @Get('capabilities')
  async getCapabilities() {
    await this.registry.initialize();
    return {
      treeSitterAvailable: (await import('./tree-sitter-engine')).isTreeSitterAvailable(),
      languages: this.registry.getCapabilityMatrix(),
      supportedLanguages: this.registry.getSupportedLanguages(),
    };
  }
}
