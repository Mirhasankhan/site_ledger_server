import { Global, Module } from "@nestjs/common";
import { BcryptService } from "./utils/bcrypt.service";
import { PrismaService } from "@/core/services/prisma/prisma.service";
import { ActivityLoggerService } from "@/core/services/activity/activity_logger.service";
import { FileService } from "@/core/services/files/cloudinary.service";
import { StripeService } from "@/core/services/stripe/stripe.service";

@Global()
@Module({
    providers: [
        BcryptService,
        PrismaService,
        ActivityLoggerService,
        FileService,
        StripeService,
    ],
    exports: [
        BcryptService,
        PrismaService,
        ActivityLoggerService,
        FileService,
        StripeService,
    ],
})
export class CommonModule {}

