import { Module } from "@nestjs/common";
import { WorkerController } from "./worker.controller";
import { WorkerService } from "./worker.service";
import { WorkerAssignmentService } from "./worker-assignment.service";
import { HttpModule } from "@nestjs/axios";
import { JwtModule } from "@nestjs/jwt";


@Module({
       imports: [
        HttpModule.register({
            timeout: 25000,
            maxRedirects: 5,
        }),
        JwtModule.register({ global: true }),
    ],
    controllers: [WorkerController],
    providers: [WorkerService, WorkerAssignmentService],
    exports: [WorkerService, WorkerAssignmentService],
})
export class WorkerModule {}
