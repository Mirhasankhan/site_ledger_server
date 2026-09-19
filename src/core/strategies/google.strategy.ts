// // src/auth/strategies/google.strategy.ts
// import { Injectable } from '@nestjs/common';
// import { PassportStrategy } from '@nestjs/passport';
// import { Strategy, Profile } from 'passport-google-oauth20';
// import { ConfigService } from '@nestjs/config';
// import { AuthService } from '@/modules/auth/auth.service';

// @Injectable()
// export class GoogleStrategy extends PassportStrategy(Strategy, 'google') {
//   constructor(
//     private readonly authService: AuthService,
//     configService: ConfigService,
//   ) {
//     super({
//       clientID: configService.get('GOOGLE_CLIENT_ID'),
//       clientSecret: configService.get('GOOGLE_CLIENT_SECRET'),
//       callbackURL: `${configService.get('APP_BASE_URL')}/auth/google/callback`,
//       scope: ['profile', 'email'],
//     });
//   }

//   async validate(
//     accessToken: string,
//     refreshToken: string,
//     profile: Profile,
//     done: Function,
//   ) {
//     const { name, email, picture } = profile._json as any;
//     try {
//       const userPayload = {
//         email,
//         fullName: `${name.givenName} ${name.familyName}`,
//         avatar: picture,
//       };

//       const tokens = await this.authService.loginWithEmail(userPayload);
//       // attach to req.user
//       done(null, tokens);
//     } catch (err) {
//       done(err, false);
//     }
//   }
// }
