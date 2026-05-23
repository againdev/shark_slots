import { Controller, Get, Header, Res } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Response } from 'express';
import { AppConfig } from 'src/app.config';

const MESSAGE_TYPE = 'shark-recaptcha';

@Controller()
export class RecaptchaPageController {
  constructor(private readonly configService: ConfigService) {}

  @Get('auth/recaptcha')
  @Header('Content-Type', 'text/html; charset=utf-8')
  @Header('Cache-Control', 'no-store')
  recaptchaPage(@Res() res: Response): void {
    const siteKey = this.configService.get<AppConfig['RECAPTCHA_SITE_KEY']>(
      'RECAPTCHA_SITE_KEY',
    );
    const mainUrl = (
      this.configService.get<AppConfig['MAIN_APP_URL']>('MAIN_APP_URL') ?? ''
    ).replace(/\/$/, '');

    let parentOrigin = mainUrl;
    try {
      parentOrigin = new URL(mainUrl).origin;
    } catch {
      /* keep raw */
    }

    res.setHeader('Content-Security-Policy', `frame-ancestors ${parentOrigin}`);

    if (!siteKey) {
      res.status(503).send('reCAPTCHA is not configured');
      return;
    }

    const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>reCAPTCHA</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      min-height: 78px;
      display: flex;
      align-items: center;
      justify-content: center;
      background: transparent;
      overflow: hidden;
    }
    #recaptcha { display: inline-block; }
  </style>
</head>
<body>
  <div id="recaptcha"></div>
  <script>
    var PARENT_ORIGIN = ${JSON.stringify(parentOrigin)};
    var MESSAGE_TYPE = ${JSON.stringify(MESSAGE_TYPE)};

    function postToken(token) {
      if (window.parent === window) return;
      window.parent.postMessage(
        { type: MESSAGE_TYPE, token: token || null },
        PARENT_ORIGIN
      );
    }

    function renderCaptcha() {
      if (!window.grecaptcha) return;
      grecaptcha.render('recaptcha', {
        sitekey: ${JSON.stringify(siteKey)},
        theme: 'dark',
        callback: postToken,
        'expired-callback': function () { postToken(null); },
        'error-callback': function () { postToken(null); }
      });
    }
  </script>
  <script src="https://www.google.com/recaptcha/api.js?onload=renderCaptcha&render=explicit" async defer></script>
</body>
</html>`;

    res.status(200).send(html);
  }
}
