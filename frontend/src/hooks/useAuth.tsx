import { createContext, useContext, useEffect, useState, useCallback, type ReactNode } from 'react';
import {
  signIn as amplifySignIn,
  signUp as amplifySignUp,
  confirmSignUp as amplifyConfirmSignUp,
  signOut as amplifySignOut,
  getCurrentUser,
  fetchAuthSession,
} from 'aws-amplify/auth';

interface AuthUser {
  userId: string;
  email: string;
}

interface AuthContextValue {
  user: AuthUser | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  signIn: (email: string, password: string) => Promise<void>;
  signUp: (email: string, password: string) => Promise<void>;
  confirmSignUp: (email: string, code: string) => Promise<void>;
  signOut: () => Promise<void>;
  getToken: () => Promise<string>;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const checkCurrentUser = useCallback(async () => {
    try {
      const currentUser = await getCurrentUser();
      const session = await fetchAuthSession();
      const email =
        session.tokens?.idToken?.payload?.email as string | undefined;

      setUser({
        userId: currentUser.userId,
        email: email ?? '',
      });
    } catch {
      setUser(null);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    checkCurrentUser();
  }, [checkCurrentUser]);

  const handleSignIn = useCallback(
    async (email: string, password: string) => {
      try {
        await amplifySignIn({ username: email, password });
        await checkCurrentUser();
      } catch (error) {
        throw toFriendlyError(error);
      }
    },
    [checkCurrentUser],
  );

  const handleSignUp = useCallback(async (email: string, password: string) => {
    try {
      await amplifySignUp({
        username: email,
        password,
        options: {
          userAttributes: {
            email,
          },
        },
      });
    } catch (error) {
      throw toFriendlyError(error);
    }
  }, []);

  const handleConfirmSignUp = useCallback(
    async (email: string, code: string) => {
      try {
        await amplifyConfirmSignUp({
          username: email,
          confirmationCode: code,
        });
      } catch (error) {
        throw toFriendlyError(error);
      }
    },
    [],
  );

  const handleSignOut = useCallback(async () => {
    try {
      await amplifySignOut();
      setUser(null);
    } catch (error) {
      throw toFriendlyError(error);
    }
  }, []);

  const getToken = useCallback(async (): Promise<string> => {
    try {
      const session = await fetchAuthSession();
      return session.tokens?.idToken?.toString() ?? '';
    } catch {
      return '';
    }
  }, []);

  const value: AuthContextValue = {
    user,
    isAuthenticated: user !== null,
    isLoading,
    signIn: handleSignIn,
    signUp: handleSignUp,
    confirmSignUp: handleConfirmSignUp,
    signOut: handleSignOut,
    getToken,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}

function toFriendlyError(error: unknown): Error {
  if (error instanceof Error) {
    const name = error.name;

    switch (name) {
      case 'UserNotFoundException':
        return new Error('No account found with that email address.');
      case 'NotAuthorizedException':
        return new Error('Incorrect email or password.');
      case 'UserAlreadyAuthenticatedException':
        return new Error('You are already signed in.');
      case 'UsernameExistsException':
        return new Error('An account with this email already exists.');
      case 'InvalidPasswordException':
        return new Error(
          'Password does not meet requirements. It must be at least 8 characters with uppercase, lowercase, numbers, and symbols.',
        );
      case 'CodeMismatchException':
        return new Error('Invalid verification code. Please try again.');
      case 'ExpiredCodeException':
        return new Error(
          'Verification code has expired. Please request a new one.',
        );
      case 'LimitExceededException':
        return new Error('Too many attempts. Please try again later.');
      case 'UserNotConfirmedException':
        return new Error(
          'Account not verified. Please check your email for a verification code.',
        );
      default:
        return new Error(error.message || 'An unexpected error occurred.');
    }
  }

  return new Error('An unexpected error occurred.');
}
