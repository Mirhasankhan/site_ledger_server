import { IsOptional, IsString } from "class-validator";

export class UpdateProfileDto {
    @IsString()
    @IsOptional()
    userName?: string;

    @IsString()
    @IsOptional()
    fullName?: string;

    @IsString()
    @IsOptional()
    name?: string;

    @IsString()
    @IsOptional()
    phone?: string;

    @IsString()
    @IsOptional()
    phoneNumber?: string;

    @IsString()
    @IsOptional()
    presentAddress?: string;

    @IsString()
    @IsOptional()
    permanentAddress?: string;

    @IsString()
    @IsOptional()
    description?: string;

    @IsString()
    @IsOptional()
    avatar?: string;

    @IsString()
    @IsOptional()
    profileImage?: string;
}

