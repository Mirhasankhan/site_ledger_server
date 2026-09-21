import { AuthModule } from "@/modules/auth/auth.module";
import { ProfileModule } from "@/modules/profile/profile.module";
import { InviteModule } from "@/modules/invite/invite.module";
import { ProjectModule } from "@/modules/project/project.module";
import { WorkerModule } from "@/modules/worker/worker.module";
import { AttendanceModule } from "@/modules/attendance/attendance.module";
import { TaskModule } from "@/modules/task/task.module";
import { DailyReportModule } from "@/modules/daily-report/daily-report.module";
import { ExpenseModule } from "@/modules/expense/expense.module";
import { MaterialModule } from "@/modules/material/material.module";
import { PaymentModule } from "@/modules/payment/payment.module";
import { ChatModule } from "@/modules/chat/chat.module";
import { LeaveModule } from "@/modules/leave/leave.module";
import { GlobalExceptionFilter } from "@/common/filters/global_exception";
import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { APP_FILTER, APP_GUARD } from "@nestjs/core";
import { ThrottlerGuard, ThrottlerModule } from "@nestjs/throttler";
import { AppController } from "./app.controller";
import { ServeStaticModule } from "@nestjs/serve-static";
import { join } from "path";
import { AuthGuard } from "@/common/guards/auth.guard";
import { CommonModule } from "@/common/common.module";

@Module({
    imports: [
        ConfigModule.forRoot({ isGlobal: true }),
        ServeStaticModule.forRoot({
            rootPath: join(__dirname, "..", "..", "uploads"),
            serveRoot: "/uploads",
        }),
        ThrottlerModule.forRoot({
            throttlers: [
                {
                    name: "short",
                    ttl: 1000,
                    limit: 100,
                },
                {
                    name: "medium",
                    ttl: 10000,
                    limit: 1000,
                },
                {
                    name: "long",
                    ttl: 600000,
                    limit: 1000,
                },
            ],
        }),
        AuthModule,
        ProfileModule,
        InviteModule,
        ProjectModule,
        WorkerModule,
        AttendanceModule,
        TaskModule,
        DailyReportModule,
        ExpenseModule,
        MaterialModule,
        PaymentModule,
        ChatModule,
        LeaveModule,
        CommonModule,
    ],
    controllers: [AppController],
    providers: [
        { provide: APP_FILTER, useClass: GlobalExceptionFilter },
        { provide: APP_GUARD, useClass: ThrottlerGuard },
        { provide: APP_GUARD, useClass: AuthGuard },
    ],
})
export class AppModule {}
