import {
    Body,
    Controller,
    Get,
    HttpStatus,
    Param,
    Patch,
    Post,
    Req,
} from "@nestjs/common";
import { MaterialService } from "./material.service";
import {
    CreateMaterialDto,
    CreateMaterialPurchaseDto,
    CreateMaterialRequestDto,
    CreateMaterialUsageDto,
    ReviewMaterialRequestDto,
    UpdateMaterialDto,
} from "./dto/body.dto";
import { ResponseService } from "@/common/interceptors/response";
import { Roles } from "@/common/decorators/roles.decorator";
import { UserRole } from "@prisma/client";
import { ApiBearerAuth, ApiOperation, ApiTags } from "@nestjs/swagger";
import { Request } from "express";
import { UserPayload } from "@/common/guards/auth.guard";

@ApiTags("Materials")
@ApiBearerAuth()
@Controller("materials")
export class MaterialController {
    constructor(private materialService: MaterialService) {}

    @Post()
    @Roles(UserRole.ADMIN, UserRole.SITE_MANAGER)
    @ApiOperation({ summary: "Create new material item in inventory catalog" })
    async createMaterial(
        @Body() payload: CreateMaterialDto,
        @Req() req: Request,
    ) {
        const user = req.user as UserPayload;
        const result = await this.materialService.createMaterial(payload, user);

        return ResponseService.formatResponse({
            statusCode: HttpStatus.CREATED,
            message: result.message,
            data: result.data,
        });
    }

    @Get()
    @Roles(UserRole.ADMIN, UserRole.SITE_MANAGER, UserRole.WORKER)
    @ApiOperation({ summary: "List materials catalog and stock levels" })
    async fetchAllMaterials(@Req() req: Request) {
        const query = req.query;
        const user = req.user as UserPayload;
        const result = await this.materialService.fetchAllMaterials(query, user);

        return ResponseService.formatResponse({
            statusCode: HttpStatus.OK,
            message: result.message,
            data: result.data,
            pagination: result.pagination,
        });
    }

    // Material requests routes placed before :id to prevent collision
    @Post("requests")
    @Roles(UserRole.ADMIN, UserRole.SITE_MANAGER)
    @ApiOperation({ summary: "Submit material request for a project" })
    async createMaterialRequest(
        @Body() payload: CreateMaterialRequestDto,
        @Req() req: Request,
    ) {
        const user = req.user as UserPayload;
        const result = await this.materialService.createMaterialRequest(payload, user);

        return ResponseService.formatResponse({
            statusCode: HttpStatus.CREATED,
            message: result.message,
            data: result.data,
        });
    }

    @Get("requests")
    @Roles(UserRole.ADMIN, UserRole.SITE_MANAGER)
    @ApiOperation({ summary: "List material requests (scoped per Rule #1)" })
    async fetchAllMaterialRequests(@Req() req: Request) {
        const query = req.query;
        const user = req.user as UserPayload;
        const result = await this.materialService.fetchAllMaterialRequests(query, user);

        return ResponseService.formatResponse({
            statusCode: HttpStatus.OK,
            message: result.message,
            data: result.data,
            pagination: result.pagination,
        });
    }

    @Patch("requests/:id/review")
    @Roles(UserRole.ADMIN, UserRole.SITE_MANAGER)
    @ApiOperation({ summary: "Review material request (Rule #6: status change only, does NOT change stock)" })
    async reviewMaterialRequest(
        @Param("id") id: string,
        @Body() payload: ReviewMaterialRequestDto,
        @Req() req: Request,
    ) {
        const user = req.user as UserPayload;
        const result = await this.materialService.reviewMaterialRequest(id, payload, user);

        return ResponseService.formatResponse({
            statusCode: HttpStatus.OK,
            message: result.message,
            data: result.data,
        });
    }

    @Get(":id")
    @Roles(UserRole.ADMIN, UserRole.SITE_MANAGER, UserRole.WORKER)
    @ApiOperation({ summary: "Get single material details with purchases and usages" })
    async fetchSingleMaterial(
        @Param("id") id: string,
        @Req() req: Request,
    ) {
        const user = req.user as UserPayload;
        const result = await this.materialService.fetchSingleMaterial(id, user);

        return ResponseService.formatResponse({
            statusCode: HttpStatus.OK,
            message: result.message,
            data: result.data,
        });
    }

    @Patch(":id")
    @Roles(UserRole.ADMIN, UserRole.SITE_MANAGER)
    @ApiOperation({ summary: "Update material details" })
    async updateMaterial(
        @Param("id") id: string,
        @Body() payload: UpdateMaterialDto,
        @Req() req: Request,
    ) {
        const user = req.user as UserPayload;
        const result = await this.materialService.updateMaterial(id, payload, user);

        return ResponseService.formatResponse({
            statusCode: HttpStatus.OK,
            message: result.message,
            data: result.data,
        });
    }

    @Post(":id/purchases")
    @Roles(UserRole.ADMIN, UserRole.SITE_MANAGER)
    @ApiOperation({ summary: "Record material purchase (Rule #6: increments Material.currentStock)" })
    async createMaterialPurchase(
        @Param("id") id: string,
        @Body() payload: CreateMaterialPurchaseDto,
        @Req() req: Request,
    ) {
        const user = req.user as UserPayload;
        const result = await this.materialService.createMaterialPurchase(id, payload, user);

        return ResponseService.formatResponse({
            statusCode: HttpStatus.CREATED,
            message: result.message,
            data: result.data,
        });
    }

    @Post(":id/usages")
    @Roles(UserRole.ADMIN, UserRole.SITE_MANAGER)
    @ApiOperation({ summary: "Record material usage (Rule #6: decrements currentStock, rejects if insufficient)" })
    async createMaterialUsage(
        @Param("id") id: string,
        @Body() payload: CreateMaterialUsageDto,
        @Req() req: Request,
    ) {
        const user = req.user as UserPayload;
        const result = await this.materialService.createMaterialUsage(id, payload, user);

        return ResponseService.formatResponse({
            statusCode: HttpStatus.CREATED,
            message: result.message,
            data: result.data,
        });
    }
}
