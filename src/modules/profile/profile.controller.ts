import {
    Body,
    Controller,
    Get,
    HttpStatus,
    Patch,
    Req,
    UploadedFiles,
    UseInterceptors,
} from "@nestjs/common";
import { ProfileService } from "./profile.service";
import { ResponseService } from "@/common/interceptors/response";
import { CustomFileFieldsInterceptor } from "@/common/interceptors/file_interceptors";
import { ParseFormDataInterceptor } from "@/common/interceptors/form_data_interceptor";
import { UpdateProfileDto } from "./dto/body.dto";
import { Request } from "express";
import { UserPayload } from "@/common/guards/auth.guard";
import { ApiOperation } from "@nestjs/swagger";

@Controller("profile")
export class ProfileController {
    constructor(private profileService: ProfileService) {}

    @Get("")
    @ApiOperation({ summary: "Get user profile" })
    async getProfile(@Req() req: Request) {
        const user = req.user as UserPayload;
        const result = await this.profileService.getProfile(user);

        return ResponseService.formatResponse({
            statusCode: HttpStatus.OK,
            message: result.message,
            data: result.data,
        });
    }

    @Patch("")
    @UseInterceptors(
        CustomFileFieldsInterceptor([
            { name: "profileImage", maxCount: 1 },
            { name: "avatar", maxCount: 1 },
        ]),
        ParseFormDataInterceptor,
    )
    @ApiOperation({ summary: "Update user profile" })
    async updateProfile(
        @Body() payload: UpdateProfileDto,
        @Req() req: Request,
        @UploadedFiles()
        files?: {
            profileImage?: Express.Multer.File[];
            avatar?: Express.Multer.File[];
        },
    ) {
        const file = files?.profileImage?.[0] || files?.avatar?.[0];
        const user = req.user as UserPayload;
        const result = await this.profileService.updateProfile(
            payload,
            user,
            file,
        );

        return ResponseService.formatResponse({
            statusCode: HttpStatus.OK,
            message: result.message,
            data: result.data,
        });
    }
}

