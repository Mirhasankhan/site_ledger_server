import { Global, Module } from "@nestjs/common";
import { BcryptService } from "./utils/bcrypt.service";
import { PrismaService } from "@/core/services/prisma/prisma.service";
import { ActivityLoggerService } from "@/core/services/activity/activity_logger.service";

@Global()
@Module({
    providers: [BcryptService, PrismaService, ActivityLoggerService],
    exports: [BcryptService, PrismaService, ActivityLoggerService],
})
export class CommonModule {}
