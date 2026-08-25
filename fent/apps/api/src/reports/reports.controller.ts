import { Controller, Get, Query } from '@nestjs/common';

import { RequirePermissions } from '../authorization/decorators/require-permissions.decorator';
import { PERMISSIONS } from '../authorization/permissions.catalog';
import { ReportsDateRangeQueryDto } from './dto/reports-date-range-query.dto';
import { ReportsService } from './reports.service';

@Controller('admin/reports')
export class ReportsController {
  constructor(private readonly reportsService: ReportsService) {}

  @RequirePermissions(PERMISSIONS.REPORTS_VIEW)
  @Get('overview')
  async overview() {
    return this.reportsService.overview();
  }

  @RequirePermissions(PERMISSIONS.REPORTS_VIEW)
  @Get('revenue')
  async revenue(@Query() query: ReportsDateRangeQueryDto) {
    return this.reportsService.revenue(new Date(query.from), new Date(query.to));
  }
}
