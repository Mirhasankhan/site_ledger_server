import { Module } from "@nestjs/common";
import { WorkerController } from "./worker.controller";
import { WorkerService } from "./worker.service";
import { WorkerAssignmentService } from "./worker-assignment.service";

@Module({
    controllers: [WorkerController],
    providers: [WorkerService, WorkerAssignmentService],
    exports: [WorkerService, WorkerAssignmentService],
})
export class WorkerModule {}
