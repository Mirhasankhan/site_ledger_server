import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { PaymentMethod } from "@prisma/client";
import {
    IsEnum,
    IsInt,
    IsNotEmpty,
    IsOptional,
    IsPositive,
    IsString,
} from "class-validator";

export class CreatePaymentDto {
    @ApiProperty({ description: "Worker User ID to pay" })
    @IsString()
    @IsNotEmpty()
    workerId: string;

    @ApiProperty({ description: "Project ID the payment is for" })
    @IsString()
    @IsNotEmpty()
    projectId: string;

    @ApiProperty({ example: 5000, description: "Payment amount (integer, BDT)" })
    @IsInt()
    @IsPositive()
    amount: number;

    @ApiPropertyOptional({
        enum: PaymentMethod,
        description: `Payment method: ${Object.values(PaymentMethod).join(", ")} (defaults to Bank_Transfer / Platform Earning Credit)`,
        example: PaymentMethod.Bank_Transfer,
    })
    @IsEnum(PaymentMethod)
    @IsOptional()
    method?: PaymentMethod;

    @ApiPropertyOptional({ example: "TXN-998877", description: "Bank/mobile-banking reference" })
    @IsOptional()
    @IsString()
    reference?: string;

    @ApiPropertyOptional({ example: "September salary advance" })
    @IsOptional()
    @IsString()
    note?: string;
}
