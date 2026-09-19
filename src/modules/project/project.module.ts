import { Module } from "@nestjs/common";
import { ProjectController } from "./project.controller";
import { ProjectService } from "./project.service";
import { RateController } from "./modules/rate/rate.controller";
import { RateService } from "./modules/rate/rate.service";
import { ActivityController } from "./activity.controller";

@Module({
    controllers: [ProjectController, RateController, ActivityController],
    providers: [ProjectService, RateService],
    exports: [ProjectService, RateService],
})
export class ProjectModule {}
