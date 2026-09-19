import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { IsArray, IsNotEmpty, IsOptional, IsString, IsUrl } from "class-validator";

export class CreateOrGetRoomDto {
    @ApiProperty({ description: "The other user's ID to open a 1:1 DM room with" })
    @IsString()
    @IsNotEmpty()
    receiverId: string;
}

export class SendDirectMessageDto {
    @ApiPropertyOptional({ example: "Hi, how is the site progress?" })
    @IsOptional()
    @IsString()
    content?: string;

    @ApiPropertyOptional({
        type: [String],
        description: "Array of file/image URLs",
        example: ["uploads/img1.jpg"],
    })
    @IsOptional()
    @IsArray()
    @IsString({ each: true })
    fileUrl?: string[];
}

export class SendProjectMessageDto {
    @ApiPropertyOptional({ example: "Foundation work is complete." })
    @IsOptional()
    @IsString()
    content?: string;

    @ApiPropertyOptional({
        type: [String],
        description: "Array of file/image URLs",
        example: ["uploads/report.pdf"],
    })
    @IsOptional()
    @IsArray()
    @IsString({ each: true })
    fileUrl?: string[];
}
