import { api } from '@/lib/api';
import type { ApiResponse } from '@gymops/shared';
import type { TutorialProgress } from './tutorial.types';

export const tutorialProgressApi = {
  list: () => api.get<ApiResponse<TutorialProgress[]>>('/me/tutorial-progress'),

  update: (
    tutorialId: string,
    data: {
      status?: TutorialProgress['status'];
      currentStepId?: string | null;
      completedSteps?: string[];
    },
  ) => api.patch<ApiResponse<TutorialProgress>>(`/me/tutorial-progress/${tutorialId}`, data),

  restart: (tutorialId: string) =>
    api.post<ApiResponse<TutorialProgress>>(`/me/tutorial-progress/${tutorialId}/restart`, {}),
};
