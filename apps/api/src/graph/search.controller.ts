import { Controller, Get, Query } from '@nestjs/common';
import type { SearchResultItem } from '@tracegraph/shared';
import { GraphService } from './graph.service';
import { SearchQueryDto } from './dto/search-query.dto';

/** `GET /api/search?q=` — deterministic name/substring lookup. */
@Controller('search')
export class SearchController {
  constructor(private readonly graphService: GraphService) {}

  @Get()
  search(@Query() query: SearchQueryDto): Promise<SearchResultItem[]> {
    return this.graphService.search(query.q, query.limit ?? 20);
  }
}
