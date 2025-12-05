// مدیریت رمز عبور

// اعتبارسنجی رمز عبور
function validatePassword(password) {
    const errors = [];
    
    if (password.length < 6) {
        errors.push('رمز عبور باید حداقل ۶ حرف داشته باشد');
    }
    
    if (!/\d/.test(password)) {
        errors.push('رمز عبور باید شامل حداقل یک عدد باشد');
    }
    
    if (!/[a-zA-Z]/.test(password)) {
        errors.push('رمز عبور باید شامل حداقل یک حرف باشد');
    }
    
    return {
        isValid: errors.length === 0,
        errors: errors
    };
}

// بررسی تشابه رمز عبور
function validatePasswordConfirmation(password, confirmPassword) {
    return {
        isValid: password === confirmPassword,
        error: password === confirmPassword ? '' : 'رمز عبور و تکرار آن مطابقت ندارند'
    };
}

// نمایش/مخفی کردن رمز عبور
function togglePasswordVisibility(inputId, toggleId) {
    const passwordInput = document.getElementById(inputId);
    const toggleButton = document.getElementById(toggleId);
    
    if (!passwordInput || !toggleButton) return;
    
    toggleButton.addEventListener('click', function() {
        const type = passwordInput.getAttribute('type') === 'password' ? 'text' : 'password';
        passwordInput.setAttribute('type', type);
        
        // تغییر آیکون
        const icon = this.querySelector('i');
        if (icon) {
            icon.className = type === 'password' ? 'fas fa-eye' : 'fas fa-eye-slash';
        }
    });
}

// تنظیم نمایش/مخفی کردن رمز عبور برای تمام فیلدها
function setupPasswordToggles() {
    // ورود
    togglePasswordVisibility('loginPassword', 'loginPasswordToggle');
    togglePasswordVisibility('registerPassword', 'registerPasswordToggle');
    togglePasswordVisibility('registerConfirmPassword', 'registerConfirmPasswordToggle');
    
    // پروفایل
    togglePasswordVisibility('currentPassword', 'currentPasswordToggle');
    togglePasswordVisibility('newPassword', 'newPasswordToggle');
    togglePasswordVisibility('confirmNewPassword', 'confirmNewPasswordToggle');
}

// مدیریت تغییر رمز عبور در پروفایل
function setupChangePassword() {
    const changePasswordForm = document.getElementById('changePasswordForm');
    if (!changePasswordForm) return;
    
    changePasswordForm.addEventListener('submit', async function(e) {
        e.preventDefault();
        
        const currentPassword = document.getElementById('currentPassword').value;
        const newPassword = document.getElementById('newPassword').value;
        const confirmNewPassword = document.getElementById('confirmNewPassword').value;
        
        // اعتبارسنجی
        const passwordValidation = validatePassword(newPassword);
        const confirmationValidation = validatePasswordConfirmation(newPassword, confirmNewPassword);
        
        if (!passwordValidation.isValid) {
            showNotification(passwordValidation.errors.join('، '), 'error');
            return;
        }
        
        if (!confirmationValidation.isValid) {
            showNotification(confirmationValidation.error, 'error');
            return;
        }
        
        try {
            // در حالت واقعی، اینجا باید رمز عبور فعلی را بررسی کنیم
            // و سپس رمز عبور جدید را ذخیره کنیم
            
            showNotification('رمز عبور با موفقیت تغییر کرد', 'success');
            changePasswordForm.reset();
            
        } catch (error) {
            console.error('Error changing password:', error);
            showNotification('خطا در تغییر رمز عبور', 'error');
        }
    });
}

// مدیریت فراموشی رمز عبور
function setupForgotPassword() {
    const forgotPasswordForm = document.getElementById('forgotPasswordForm');
    if (!forgotPasswordForm) return;
    
    forgotPasswordForm.addEventListener('submit', async function(e) {
        e.preventDefault();
        
        const email = document.getElementById('forgotEmail').value.trim();
        
        if (!email || !email.includes('@')) {
            showNotification('لطفاً یک ایمیل معتبر وارد کنید', 'error');
            return;
        }
        
        try {
            // در حالت واقعی، اینجا باید ایمیل بازنشانی رمز عبور ارسال شود
            showNotification('لینک بازنشانی رمز عبور به ایمیل شما ارسال شد', 'success');
            forgotPasswordForm.reset();
            
            // بستن مدال
            const forgotPasswordModal = document.getElementById('forgotPasswordModal');
            if (forgotPasswordModal) {
                forgotPasswordModal.style.display = 'none';
            }
            
        } catch (error) {
            console.error('Error sending reset password email:', error);
            showNotification('خطا در ارسال لینک بازنشانی', 'error');
        }
    });
}

// نمایش فرم فراموشی رمز عبور
function showForgotPassword() {
    const authModal = document.getElementById('authModal');
    const forgotPasswordModal = document.getElementById('forgotPasswordModal');
    
    if (authModal) authModal.style.display = 'none';
    if (forgotPasswordModal) forgotPasswordModal.style.display = 'flex';
}

// نمایش فرم ورود
function showLogin() {
    const forgotPasswordModal = document.getElementById('forgotPasswordModal');
    const authModal = document.getElementById('authModal');
    
    if (forgotPasswordModal) forgotPasswordModal.style.display = 'none';
    if (authModal) {
        authModal.style.display = 'flex';
        // تغییر به تب ورود
        document.querySelectorAll('.form-tab').forEach(t => t.classList.remove('active'));
        document.querySelectorAll('.form-tab-content').forEach(c => c.classList.remove('active'));
        
        const loginTab = document.querySelector('.form-tab[data-tab="login"]');
        const loginTabContent = document.getElementById('login-tab');
        
        if (loginTab) loginTab.classList.add('active');
        if (loginTabContent) loginTabContent.classList.add('active');
    }
}

// مقداردهی اولیه مدیریت رمز عبور
document.addEventListener('DOMContentLoaded', function() {
    setupPasswordToggles();
    setupChangePassword();
    setupForgotPassword();
    
    // لینک فراموشی رمز عبور
    const forgotPasswordLink = document.getElementById('forgotPassword');
    if (forgotPasswordLink) {
        forgotPasswordLink.addEventListener('click', function(e) {
            e.preventDefault();
            showForgotPassword();
        });
    }
});

// صادر کردن توابع
if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
        validatePassword,
        validatePasswordConfirmation,
        togglePasswordVisibility,
        showForgotPassword,
        showLogin
    };
} else {
    window.passwordManager = {
        validatePassword,
        validatePasswordConfirmation,
        togglePasswordVisibility,
        showForgotPassword,
        showLogin
    };
}