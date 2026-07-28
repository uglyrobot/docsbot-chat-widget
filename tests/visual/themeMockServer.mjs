import http from 'node:http';

const markdownAnswer = `# Streamdown review

This checks **bold**, _emphasis_, [safe links](https://example.com), inline \`code\`, and a blockquote.

> Theme-aware content should stay readable without becoming a bright island.

| Surface | Status |
| --- | --- |
| Tables | Themed |
| Code | Syntax colors |

\`\`\`js
const greeting = "Dark mode";
function contrast(background, foreground) {
  return WCAG.ratio(background, foreground);
}
\`\`\`

\`\`\`mermaid
flowchart LR
  Auto --> Dark
  Auto --> Light
  Brand --> Contrast
\`\`\``;

const stripeBilling = [
	{
		type: 'invoices',
		items: [
			{
				id: 'in_paid',
				invoiceNumber: '1042',
				status: 'paid',
				amountDue: '0',
				amountPaid: '249.00',
				currency: 'usd',
				createdAt: '2026-07-28T12:00:00Z',
				hostedInvoiceUrl: 'https://example.com/invoice',
				invoicePdf: 'https://example.com/invoice.pdf',
				lineItems: [
					{
						description: 'DocsBot Business',
						quantity: 1,
						amount: '249.00',
						currency: 'usd'
					}
				]
			},
			{
				id: 'in_open',
				invoiceNumber: '1043',
				status: 'open',
				amountDue: '99.00',
				amountPaid: '0',
				currency: 'usd',
				createdAt: '2026-07-27T12:00:00Z'
			}
		]
	},
	{
		type: 'subscriptions',
		items: [
			{
				id: 'sub_active',
				status: 'active',
				currency: 'usd',
				currentPeriodStartAt: '2026-07-01T00:00:00Z',
				currentPeriodEndAt: '2026-08-01T00:00:00Z',
				cancelAtPeriodEnd: true,
				items: [
					{
						planName: 'DocsBot Business',
						quantity: 1,
						unitAmount: 24900,
						currency: 'usd',
						recurringInterval: 'month'
					}
				]
			}
		]
	}
];

function buildAgentSse(question) {
	const showStripe = String(question).toLowerCase().includes('billing');
	const showScheduler = String(question).toLowerCase().includes('schedule');
	const answer = showStripe
		? 'Here are representative billing cards.'
		: showScheduler
			? 'Choose a time that works for you.'
		: markdownAnswer;
	const final = {
		answer,
		sources: showStripe
			? []
			: [
					{
						title: 'Theme source',
						url: 'https://example.com/theme',
						type: 'url'
					}
				],
		stripeBilling: showStripe ? stripeBilling : null,
		history: [
			{ role: 'user', message: question },
			{ role: 'assistant', message: answer }
		],
		id: showStripe
			? 'answer-stripe'
			: showScheduler
				? 'answer-scheduler'
				: 'answer-markdown'
	};

	const schedulerEvent = showScheduler
		? `event: tool_call\ndata: ${JSON.stringify({
				name: 'calendly',
				params: { eventPath: 'uglyrobot/30min' }
			})}\n\n`
		: '';
	return `${schedulerEvent}event: stream\ndata: ${answer.replaceAll('\n', '\nevent: stream\ndata: ')}\n\nevent: done\ndata: ${JSON.stringify(final)}\n\n`;
}

function corsHeaders(contentType) {
	return {
		'access-control-allow-origin': '*',
		'access-control-allow-methods': 'GET,POST,PUT,OPTIONS',
		'access-control-allow-headers': 'content-type,authorization',
		'cache-control': 'no-cache',
		'content-type': contentType
	};
}

const agentServer = http.createServer((request, response) => {
	if (request.method === 'OPTIONS') {
		response.writeHead(204, corsHeaders('text/plain'));
		response.end();
		return;
	}

	if (request.method === 'PUT') {
		response.writeHead(200, corsHeaders('application/json'));
		response.end('{}');
		return;
	}

	let body = '';
	request.setEncoding('utf8');
	request.on('data', (chunk) => {
		body += chunk;
	});
	request.on('end', () => {
		let question = '';
		try {
			question = JSON.parse(body).question || '';
		} catch {
			question = '';
		}
		response.writeHead(200, corsHeaders('text/event-stream'));
		response.end(buildAgentSse(question));
	});
});

agentServer.listen(9100, '127.0.0.1', () => {
	console.log('Theme mock agent server listening on 127.0.0.1:9100');
});

function close() {
	agentServer.close();
}

process.on('SIGINT', close);
process.on('SIGTERM', close);
