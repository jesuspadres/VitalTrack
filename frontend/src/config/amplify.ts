import { Amplify } from 'aws-amplify';

const region = import.meta.env.VITE_AWS_REGION || 'us-east-1';
const userPoolId = import.meta.env.VITE_COGNITO_USER_POOL_ID;
const userPoolClientId = import.meta.env.VITE_COGNITO_CLIENT_ID;

Amplify.configure({
  Auth: {
    Cognito: {
      userPoolId,
      userPoolClientId,
      loginWith: {
        email: true,
      },
    },
  },
});

export { region, userPoolId, userPoolClientId };
