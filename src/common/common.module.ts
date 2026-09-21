import { Global, Module } from "@nestjs/common";
import { BcryptService } from "./utils/bcrypt.service";
import { PrismaService } from "@/core/services/prisma/prisma.service";
import { ActivityLoggerService } from "@/core/services/activity/activity_logger.service";
import { FileService } from "@/core/services/files/cloudinary.service";

@Global()
@Module({
    providers: [
        BcryptService,
        PrismaService,
        ActivityLoggerService,
        FileService,
    ],
    exports: [BcryptService, PrismaService, ActivityLoggerService, FileService],
})
export class CommonModule {}
