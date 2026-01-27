/**
 * Server entry point - initializes and starts the Express application
 */
import { createApp } from './app';
import { config } from './config/index';

export interface BannerOptions {
  title: string;
  port: number;
  provider: string;
  model: string;
  rateLimit: number;
  configEnv?: string;
}

export const generateBanner = (options: BannerOptions): string[] => {
  const reset = '\x1b[0m';
  const bright = '\x1b[1m';
  const dim = '\x1b[2m';
  const green = '\x1b[32m';
  const cyan = '\x1b[36m';
  const yellow = '\x1b[33m';
  const blue = '\x1b[34m';
  const magenta = '\x1b[35m';

  const boxWidth = 55;
  const contentWidth = boxWidth - 6;

  const getVisibleWidth = (text: string): number => {
    const ansiEscape = '\x1b';
    const ansiRegex = new RegExp(`${ansiEscape}\\[[0-9;]*m`, 'g');
    const textWithoutAnsi = text.replace(ansiRegex, '');

    let width = 0;
    for (let i = 0; i < textWithoutAnsi.length; i++) {
      const codePoint = textWithoutAnsi.codePointAt(i) || 0;
      if (codePoint > 0xffff) {
        i++;
      }
      if (
        codePoint >= 0x1f000 ||
        (codePoint >= 0x1100 && codePoint <= 0x115f) ||
        (codePoint >= 0x2e80 && codePoint <= 0x4dbf) ||
        (codePoint >= 0x4e00 && codePoint <= 0x9fff) ||
        (codePoint >= 0xac00 && codePoint <= 0xd7af) ||
        (codePoint >= 0xf900 && codePoint <= 0xfaff) ||
        (codePoint >= 0xfe30 && codePoint <= 0xfe4f) ||
        (codePoint >= 0xff00 && codePoint <= 0xffef)
      ) {
        width += 2;
      } else {
        width += 1;
      }
    }
    return width;
  };

  const padRight = (text: string, width: number): string => {
    const visibleLength = getVisibleWidth(text);
    return text + ' '.repeat(Math.max(0, width - visibleLength));
  };

  const createLine = (content: string): string => {
    return `${bright}${green}║${reset}  ${padRight(content, contentWidth)}  ${bright}${green}║${reset}`;
  };

  const topBorder = `${bright}${green}╔${'═'.repeat(boxWidth - 2)}╗${reset}`;
  const divider = `${bright}${green}╠${'═'.repeat(boxWidth - 2)}╣${reset}`;
  const bottomBorder = `${bright}${green}╚${'═'.repeat(boxWidth - 2)}╝${reset}`;

  const lines: string[] = [];
  lines.push('');
  lines.push(topBorder);
  lines.push(createLine(`${bright}${cyan}${options.title}${reset}`));
  lines.push(divider);
  lines.push(createLine(`${dim}Status:${reset}     ${bright}${green}✓ Running${reset}`));
  lines.push(createLine(`${dim}Port:${reset}       ${bright}${yellow}${options.port}${reset}`));
  lines.push(createLine(`${dim}Provider:${reset}   ${bright}${blue}${options.provider}${reset}`));
  lines.push(createLine(`${dim}Model:${reset}      ${bright}${magenta}${options.model}${reset}`));
  lines.push(
    createLine(
      `${dim}Rate Limit:${reset} ${bright}${yellow}${options.rateLimit}${reset} requests/hour`
    )
  );

  if (options.configEnv) {
    lines.push(
      createLine(`${dim}Config:${reset}    ${dim}AI_PROVIDER=${options.configEnv}${reset}`)
    );
  }

  lines.push(bottomBorder);
  lines.push('');

  return lines;
};

// Only start server if this file is run directly (not imported in tests)
if (import.meta.main) {
  const { app, services } = await createApp();
  const { port } = config.server;

  app.listen(port, () => {
    const providerName = config.ai.provider;
    const modelName = providerName === 'ollama' ? config.ai.ollama.model : config.ai.xai.model;

    const banner = generateBanner({
      title: '🤖 AI Bot Server',
      port,
      provider: providerName,
      model: modelName,
      rateLimit: config.rateLimit.maxRequestsPerHour,
      configEnv: process.env.AI_PROVIDER,
    });

    banner.forEach((line) => console.log(line));
    console.log(`Active persona: ${services.persona.getPersonaName()}\n`);

    // Log server startup details
    services.logger.info(`Server started successfully on port ${port}`);
    services.logger.info(`Log level: ${config.logging.logLevel}`);
    services.logger.info(
      `AI Provider: ${providerName} (model: ${modelName}, max tokens: ${config.ai.maxTokens})`
    );
    services.logger.info(`Active persona: ${services.persona.getPersonaName()}`);
    services.logger.info(`Rate limit: ${config.rateLimit.maxRequestsPerHour} requests/hour`);
  });

  // Graceful shutdown
  function cleanup(): void {
    services.logger.info('Server shutting down');
    services.conversation.destroy();
    process.exit(0);
  }

  process.on('SIGTERM', cleanup);
  process.on('SIGINT', cleanup);
}
