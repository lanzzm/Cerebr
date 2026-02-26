import { normalizeChatCompletionsUrl } from '../utils/api-url.js';
import { t } from '../utils/i18n.js';

export async function generateImage({ content, imageApiConfig }) {
    const baseUrl = normalizeChatCompletionsUrl(imageApiConfig?.baseUrl);
    if (!baseUrl || !imageApiConfig?.apiKey) {
        throw new Error(t('error_image_api_config_incomplete'));
    }

    const prompt = `将以下内容总结成一张精美的图片:\n\n${content}`;

    const response = await fetch(baseUrl, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${imageApiConfig.apiKey}`
        },
        body: JSON.stringify({
            model: imageApiConfig.modelName || 'gemini-2.0-flash-preview-image-generation',
            stream: false,
            messages: [{ role: 'user', content: prompt }]
        })
    });

    if (!response.ok) {
        const errorText = await response.text().catch(() => '');
        throw new Error(errorText || response.statusText || `HTTP ${response.status}`);
    }

    const data = await response.json();
    const responseContent = data.choices?.[0]?.message?.content || '';

    // Parse: ![image](data:image/jpeg;base64,xxxxx)
    const match = responseContent.match(/data:image\/[^;]+;base64,[^)]+/);
    if (!match) {
        throw new Error(t('error_image_generation_no_image'));
    }

    return { base64Data: match[0] };
}
