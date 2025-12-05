// توابع مدیریت کاربران
async function signUpUser(name, email, phone, password, userType) {
    try {
        // 1. ثبت‌نام در Authentication
        const { data: authData, error: authError } = await supabase.auth.signUp({
            email,
            password,
            options: {
                data: {
                    name,
                    phone,
                    role: userType
                }
            }
        });

        if (authError) throw authError;

        if (authData.user) {
            // 2. ایجاد رکورد در جدول public.users
            const { error: userError } = await supabase
                .from('users')
                .insert([{
                    id: authData.user.id,
                    name: name,
                    email: email,
                    phone: phone,
                    role: userType,
                    status: 'approved' // یا 'pending' برای تایید دستی
                }]);

            if (userError) {
                console.error('Error creating user record:', userError);
                // اگر خطا در ایجاد رکورد بود، کاربر Auth را پاک می‌کنیم
                await supabase.auth.admin.deleteUser(authData.user.id);
                throw new Error('خطا در ایجاد حساب کاربری');
            }

            // 3. ارسال ایمیل تأیید (اختیاری)
            await supabase.auth.resend({
                type: 'signup',
                email: email
            });

            return {
                success: true,
                message: 'ثبت‌نام موفقیت‌آمیز بود. لطفاً ایمیل خود را تأیید کنید.',
                userId: authData.user.id
            };
        }

    } catch (error) {
        console.error('Sign up error:', error);
        return {
            success: false,
            message: error.message || 'خطا در ثبت‌نام'
        };
    }
}

async function signInUser(email, password) {
    try {
        const { data, error } = await supabase.auth.signInWithPassword({
            email,
            password
        });

        if (error) throw error;

        if (data.user) {
            // بارگذاری اطلاعات کاربر از جدول public.users
            const { data: userData, error: userError } = await supabase
                .from('users')
                .select('*')
                .eq('id', data.user.id)
                .single();

            if (userError) {
                console.error('Error loading user profile:', userError);
                // اگر رکورد در public.users وجود نداشت، ایجاد می‌کنیم
                await createUserProfile(data.user);
            } else {
                currentUser = userData;
                isAdmin = currentUser.role === 'admin';
            }

            return {
                success: true,
                message: 'ورود موفقیت‌آمیز بود',
                user: currentUser
            };
        }

    } catch (error) {
        console.error('Sign in error:', error);
        return {
            success: false,
            message: 'ایمیل یا رمز عبور اشتباه است'
        };
    }
}

async function createUserProfile(authUser) {
    try {
        const userMetadata = authUser.user_metadata;
        
        const { data, error } = await supabase
            .from('users')
            .insert([{
                id: authUser.id,
                name: userMetadata.name || authUser.email.split('@')[0],
                email: authUser.email,
                phone: userMetadata.phone || '',
                role: userMetadata.role || 'passenger',
                status: 'approved'
            }])
            .select()
            .single();

        if (error) throw error;

        currentUser = data;
        isAdmin = currentUser.role === 'admin';

        return currentUser;

    } catch (error) {
        console.error('Error creating user profile:', error);
        throw error;
    }
}

async function checkAuthStatus() {
    try {
        const { data: { session }, error } = await supabase.auth.getSession();
        
        if (error) throw error;
        
        if (session) {
            // بارگذاری اطلاعات کاربر از جدول public.users
            const { data: userData, error: userError } = await supabase
                .from('users')
                .select('*')
                .eq('id', session.user.id)
                .single();

            if (userError) {
                // اگر رکورد وجود نداشت، ایجاد می‌کنیم
                await createUserProfile(session.user);
            } else {
                currentUser = userData;
                isAdmin = currentUser.role === 'admin';
            }

            updateUIAfterLogin();
            return true;
        }
        
        return false;
        
    } catch (error) {
        console.error('Error checking auth status:', error);
        return false;
    }
}

async function updateUserProfile(updates) {
    try {
        if (!currentUser) throw new Error('کاربر وارد نشده است');

        const { data, error } = await supabase
            .from('users')
            .update(updates)
            .eq('id', currentUser.id)
            .select()
            .single();

        if (error) throw error;

        // به‌روزرسانی اطلاعات کاربر
        Object.assign(currentUser, data);
        
        return {
            success: true,
            message: 'پروفایل با موفقیت به‌روزرسانی شد',
            user: currentUser
        };

    } catch (error) {
        console.error('Update profile error:', error);
        return {
            success: false,
            message: error.message || 'خطا در به‌روزرسانی پروفایل'
        };
    }
}

async function changePassword(currentPassword, newPassword) {
    try {
        // تأیید رمز عبور فعلی
        const { error: verifyError } = await supabase.auth.signInWithPassword({
            email: currentUser.email,
            password: currentPassword
        });

        if (verifyError) {
            return {
                success: false,
                message: 'رمز عبور فعلی اشتباه است'
            };
        }

        // تغییر رمز عبور
        const { error: updateError } = await supabase.auth.updateUser({
            password: newPassword
        });

        if (updateError) throw updateError;

        return {
            success: true,
            message: 'رمز عبور با موفقیت تغییر کرد'
        };

    } catch (error) {
        console.error('Change password error:', error);
        return {
            success: false,
            message: error.message || 'خطا در تغییر رمز عبور'
        };
    }
}

async function resetPassword(email) {
    try {
        const { error } = await supabase.auth.resetPasswordForEmail(email, {
            redirectTo: window.location.origin + '/reset-password.html'
        });

        if (error) throw error;

        return {
            success: true,
            message: 'لینک بازنشانی رمز عبور به ایمیل شما ارسال شد'
        };

    } catch (error) {
        console.error('Reset password error:', error);
        return {
            success: false,
            message: error.message || 'خطا در ارسال لینک بازنشانی'
        };
    }
}

async function updateEmail(newEmail, password) {
    try {
        // تأیید رمز عبور فعلی
        const { error: verifyError } = await supabase.auth.signInWithPassword({
            email: currentUser.email,
            password: password
        });

        if (verifyError) {
            return {
                success: false,
                message: 'رمز عبور اشتباه است'
            };
        }

        // تغییر ایمیل
        const { data, error } = await supabase.auth.updateUser({
            email: newEmail
        });

        if (error) throw error;

        // به‌روزرسانی ایمیل در جدول users
        await updateUserProfile({ email: newEmail });

        return {
            success: true,
            message: 'ایمیل با موفقیت تغییر کرد. لطفاً ایمیل جدید خود را تأیید کنید.'
        };

    } catch (error) {
        console.error('Update email error:', error);
        return {
            success: false,
            message: error.message || 'خطا در تغییر ایمیل'
        };
    }
}

// لیسنرهای فرم‌ها
document.addEventListener('DOMContentLoaded', function() {
    // فرم ثبت‌نام
    const registerForm = document.getElementById('registerForm');
    if (registerForm) {
        registerForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            
            const name = document.getElementById('registerName').value.trim();
            const email = document.getElementById('registerEmail').value.trim();
            const phone = document.getElementById('registerPhone').value.trim();
            const password = document.getElementById('registerPassword').value;
            const confirmPassword = document.getElementById('registerConfirmPassword').value;
            const userType = document.getElementById('userType').value;

            // اعتبارسنجی
            if (password !== confirmPassword) {
                showNotification('رمز عبور و تکرار آن مطابقت ندارند', 'error');
                return;
            }

            const result = await signUpUser(name, email, phone, password, userType);
            
            if (result.success) {
                showNotification(result.message, 'success');
                registerForm.reset();
                // تغییر به تب ورود
                switchToLoginTab();
            } else {
                showNotification(result.message, 'error');
            }
        });
    }

    // فرم ورود
    const loginForm = document.getElementById('loginForm');
    if (loginForm) {
        loginForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            
            const email = document.getElementById('loginEmail').value.trim();
            const password = document.getElementById('loginPassword').value;

            const result = await signInUser(email, password);
            
            if (result.success) {
                showNotification(result.message, 'success');
                loginForm.reset();
                document.getElementById('authModal').style.display = 'none';
            } else {
                showNotification(result.message, 'error');
            }
        });
    }

    // فرم تغییر رمز عبور
    const changePasswordForm = document.getElementById('changePasswordForm');
    if (changePasswordForm) {
        changePasswordForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            
            const currentPassword = document.getElementById('currentPassword').value;
            const newPassword = document.getElementById('newPassword').value;
            const confirmNewPassword = document.getElementById('confirmNewPassword').value;

            if (newPassword !== confirmNewPassword) {
                showNotification('رمز عبور جدید و تکرار آن مطابقت ندارند', 'error');
                return;
            }

            const result = await changePassword(currentPassword, newPassword);
            
            if (result.success) {
                showNotification(result.message, 'success');
                changePasswordForm.reset();
            } else {
                showNotification(result.message, 'error');
            }
        });
    }

    // فرم فراموشی رمز عبور
    const forgotPasswordForm = document.getElementById('forgotPasswordForm');
    if (forgotPasswordForm) {
        forgotPasswordForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            
            const email = document.getElementById('forgotEmail').value.trim();

            const result = await resetPassword(email);
            
            if (result.success) {
                showNotification(result.message, 'success');
                forgotPasswordForm.reset();
            } else {
                showNotification(result.message, 'error');
            }
        });
    }

    // فرم تغییر ایمیل
    const changeEmailForm = document.getElementById('changeEmailForm');
    if (changeEmailForm) {
        changeEmailForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            
            const newEmail = document.getElementById('newEmail').value.trim();
            const password = document.getElementById('passwordForEmail').value;

            const result = await updateEmail(newEmail, password);
            
            if (result.success) {
                showNotification(result.message, 'success');
                changeEmailForm.reset();
            } else {
                showNotification(result.message, 'error');
            }
        });
    }

    // فرم به‌روزرسانی پروفایل
    const profileForm = document.getElementById('profileForm');
    if (profileForm) {
        profileForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            
            const name = document.getElementById('editName').value.trim();
            const phone = document.getElementById('editPhone').value.trim();

            const result = await updateUserProfile({
                name,
                phone
            });
            
            if (result.success) {
                showNotification(result.message, 'success');
                updateProfilePage();
            } else {
                showNotification(result.message, 'error');
            }
        });
    }

    // بررسی وضعیت ورود هنگام لود صفحه
    checkAuthStatus();
});

// تابع کمکی برای تغییر تب
function switchToLoginTab() {
    const loginTab = document.querySelector('[data-tab="login"]');
    const loginContent = document.getElementById('login-tab');
    
    if (loginTab && loginContent) {
        document.querySelectorAll('.form-tab').forEach(tab => tab.classList.remove('active'));
        document.querySelectorAll('.form-tab-content').forEach(content => content.classList.remove('active'));
        
        loginTab.classList.add('active');
        loginContent.classList.add('active');
    }
}

// ذخیره وضعیت کاربر در localStorage (اختیاری)
function saveUserToLocalStorage(user) {
    try {
        localStorage.setItem('snap_user', JSON.stringify({
            id: user.id,
            name: user.name,
            email: user.email,
            role: user.role
        }));
    } catch (error) {
        console.error('Error saving user to localStorage:', error);
    }
}

function loadUserFromLocalStorage() {
    try {
        const userData = localStorage.getItem('snap_user');
        if (userData) {
            return JSON.parse(userData);
        }
    } catch (error) {
        console.error('Error loading user from localStorage:', error);
    }
    return null;
}

function clearUserFromLocalStorage() {
    localStorage.removeItem('snap_user');
}

// مدیریت رویدادهای Auth تغییر وضعیت
supabase.auth.onAuthStateChange((event, session) => {
    console.log('Auth state changed:', event);
    
    if (event === 'SIGNED_IN' && session) {
        checkAuthStatus();
    } else if (event === 'SIGNED_OUT') {
        currentUser = null;
        isAdmin = false;
        updateUIAfterLogout();
        clearUserFromLocalStorage();
    }
});