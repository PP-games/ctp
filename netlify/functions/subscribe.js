// Netlify serverless function to proxy Mailchimp subscriptions
// This avoids browser tracking protection blocking direct Mailchimp requests

exports.handler = async (event) => {
  // Only allow POST
  if (event.httpMethod !== 'POST') {
    return {
      statusCode: 405,
      body: JSON.stringify({ error: 'Method not allowed' })
    };
  }

  // CORS headers
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Content-Type': 'application/json'
  };

  try {
    const { email, tags } = JSON.parse(event.body);

    if (!email) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ error: 'Email is required' })
      };
    }

    // Mailchimp API credentials - set these in Netlify environment variables
    const API_KEY = process.env.MAILCHIMP_API_KEY;
    const AUDIENCE_ID = process.env.MAILCHIMP_AUDIENCE_ID;
    const DC = process.env.MAILCHIMP_DC || 'us13'; // Data center from API key suffix

    if (!API_KEY || !AUDIENCE_ID) {
      console.error('Missing Mailchimp credentials');
      return {
        statusCode: 500,
        headers,
        body: JSON.stringify({ error: 'Server configuration error' })
      };
    }

    // Prepare Mailchimp API request
    const mailchimpUrl = `https://${DC}.api.mailchimp.com/3.0/lists/${AUDIENCE_ID}/members`;

    const memberData = {
      email_address: email,
      status: 'pending', // Double opt-in (sends confirmation email)
    };

    // Add tags if provided
    if (tags) {
      memberData.tags = Array.isArray(tags) ? tags : [tags];
    }

    const response = await fetch(mailchimpUrl, {
      method: 'POST',
      headers: {
        'Authorization': `Basic ${Buffer.from(`anystring:${API_KEY}`).toString('base64')}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(memberData)
    });

    const data = await response.json();

    if (response.ok) {
      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({
          success: true,
          message: 'Please check your email to confirm your subscription!'
        })
      };
    }

    // Handle Mailchimp errors
    if (data.title === 'Member Exists') {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({
          error: 'This email is already subscribed.',
          code: 'MEMBER_EXISTS'
        })
      };
    }

    if (data.title === 'Invalid Resource') {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({
          error: 'Please enter a valid email address.',
          code: 'INVALID_EMAIL'
        })
      };
    }

    // Generic error
    console.error('Mailchimp error:', data);
    return {
      statusCode: 400,
      headers,
      body: JSON.stringify({
        error: data.detail || 'Subscription failed. Please try again.',
        code: data.title
      })
    };

  } catch (error) {
    console.error('Function error:', error);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ error: 'An error occurred. Please try again.' })
    };
  }
};
