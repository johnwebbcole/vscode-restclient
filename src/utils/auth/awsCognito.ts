import { Amplify } from "aws-amplify";
import { fetchAuthSession, getCurrentUser, signIn } from "aws-amplify/auth";

type BeforeRequestHook = (options: any) => void | Promise<void>;

async function login(
  username: string,
  password: string,
  userPoolId: string,
  clientId: string
): Promise<{
  authId: string;
  idToken: string;
  accessToken: string;
}> {
  Amplify.configure({
    Auth: {
      Cognito: {
        userPoolId,
        userPoolClientId: clientId,
      },
    },
  });

  await signIn({ username, password });
  const { username: authId } = await getCurrentUser();
  const { tokens } = await fetchAuthSession();
  const idToken = tokens?.idToken?.toString();
  const accessToken = tokens?.accessToken?.toString();

  if (!idToken || !accessToken) {
    throw Error(`Invalid auth response: ${JSON.stringify(tokens, null, 2)}`);
  }

  return {
    authId,
    idToken,
    accessToken,
  };
}

export async function awsCognito(
  authorization: string
): Promise<BeforeRequestHook> {
  const [, username, password, , userPoolId, clientId] = authorization.split(/\s+/);

  const { accessToken } = await login(
    username,
    password,
    userPoolId,
    clientId
  );

  return async (options) => {
    options.headers = {
      ...options.headers,
      Authorization: `Bearer ${accessToken}`,
    };
  };
}
