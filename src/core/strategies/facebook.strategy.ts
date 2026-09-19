// import { Injectable } from '@nestjs/common';
// import { PassportStrategy } from '@nestjs/passport';
// import { Strategy, Profile } from 'passport-facebook';
// import { ConfigService } from '@nestjs/config';
// import { AuthService } from '@/modules/auth/auth.service';

// @Injectable()
// export class FacebookStrategy extends PassportStrategy(Strategy, 'facebook') {
//   constructor(
//     private readonly authService: AuthService,
//     configService: ConfigService,
//   ) {
//     super({
//       clientID: configService.get('FACEBOOK_CLIENT_ID'),
//       clientSecret: configService.get('FACEBOOK_CLIENT_SECRET'),
//       callbackURL: `${configService.get('APP_BASE_URL')}/auth/facebook/callback`,
//       profileFields: ['id', 'emails', 'name', 'picture.type(large)'], // ✅ Essential
//     });
//   }

//   async validate(
//     accessToken: string,
//     refreshToken: string,
//     profile: Profile,
//     done: Function,
//   ) {
//     console.log(`see profile`, profile);
//     try {
//       const email = profile.emails?.[0]?.value || '';
//       const fullName = `${profile.name?.givenName || ''} ${profile.name?.familyName || ''}`.trim();
//       const avatar = profile.photos?.[0]?.value || '';

//       const userPayload = {
//         email,
//         fullName,
//         avatar,
//       };

//       const tokens = await this.authService.loginWithEmail(userPayload);
//       done(null, tokens);
//     } catch (err) {
//       done(err, false);
//     }
//   }
// }
