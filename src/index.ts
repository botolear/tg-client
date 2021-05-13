import { Update } from '@botol/tg-types';
import fetch from 'node-fetch';
import AbortController from 'abort-controller';
import FormData from 'form-data';

export class TgClient {
    constructor(
        private token: string,
        private onUpdate: (update: Update) => void | Promise<void>,
        private getApiServer: (token: string, command: string) => string = (
            token,
            command,
        ) => `https://api.telegram.org/bot${token}/${command}`,
    ) {}

    private isStarted = false;
    private abortController: AbortController = new AbortController();
    private failRequests = 0;
    private offset = 0;

    async start() {
        if (this.isStarted) {
            throw new Error('Already started');
        }

        this.isStarted = true;
        this.offset = 0;

        while (true) {
            try {
                let json = await this.getUpates();
                await this.handleUpdates(json);
            } catch (e) {
                if (e.name === 'AbortError' || e.message == 'Abort') {
                    this.isStarted = false;
                    this.abortController = new AbortController();
                    this.failRequests = 0;
                    return;
                }

                console.error(e.message);
                console.log('Trying again');
                await new Promise<void>((res) => {
                    setTimeout(() => {
                        res();
                    }, 500);
                });
            }
        }
    }

    private async getUpates(): Promise<any> {
        let response = await fetch(
            this.getApiServer(this.token, 'getUpdates'),
            {
                method: 'post',
                body: JSON.stringify({
                    offset: this.offset,
                    timeout: 30,
                }),
                headers: { 'Content-Type': 'application/json' },
                signal: this.abortController.signal,
            },
        );

        return response.json();
    }

    private async handleUpdates(json: any) {
        if (!this.checkUpdate(json)) {
            let message = "Can't make request to telegram api";
            if ('error_code' in json) {
                message += `\n${json['error_code']}`;
            }
            if ('description' in json) {
                message += `\n${json['description']}`;
            }
            console.error(message);
            throw new Error('Abort');
        }

        this.failRequests = 0;

        for (let update of json['result']) {
            await Promise.resolve(this.onUpdate(update));
            this.offset = update.update_id + 1;
        }
    }

    async stop() {
        if (!this.isStarted) {
            throw new Error('Not started');
        }
        this.abortController.abort();
    }

    private checkUpdate(json: any): boolean {
        if (!('ok' in json || 'result' in json)) {
            return false;
        }
        if (json['ok'] !== true) {
            return false;
        }

        return true;
    }

    async makeRequest(command: string, params: { [key: number]: any } = {}) {
        let form = new FormData();
        for (let key in params) {
            form.append(key, params[key]);
        }

        let response = await fetch(this.getApiServer(this.token, command), {
            method: 'post',
            body: form,
        });
        let json = await response.json();
        if (json?.ok !== true) {
            throw new Error(json);
        }
        if ('result' in json) {
            return json['result'];
        }
        return json;
    }
}
