import { useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { PageLoader } from '../../components/ui'

export function InstructorManageClassRedirect() {
  const navigate = useNavigate()

  useEffect(() => {
    navigate('/instructor/classes', { replace: true })
  }, [navigate])

  return <PageLoader label="Đang kết nối đến trang quản lý lớp học..." />
}
