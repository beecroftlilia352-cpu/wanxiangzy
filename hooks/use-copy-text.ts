"use client";

import { toast } from "sonner";
import copy from "copy-to-clipboard";

export function useCopyText() {
    return (value: string, successText = "已复制") => {
        copy(value);
        toast.success(successText);
    };
}
